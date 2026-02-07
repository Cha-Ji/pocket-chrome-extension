---
name: queue-issue
description: 이슈 큐에 새 이슈를 추가합니다. GitHub API 접근이 불가능한 클라우드 환경에서 사용합니다.
argument-hint: "<bug|feature|refactor> <이슈 제목>"
allowed-tools: Read, Write, Glob, Grep
---

# Issue Queue에 새 이슈 추가

`docs/issue-queue/`에 새 이슈 파일을 생성합니다.

## 입력

- `$0`: 이슈 타입 (`bug`, `feature`, `refactor`)
- 나머지 `$ARGUMENTS`: 이슈 제목/설명

타입 없이 설명만 제공된 경우, 내용을 분석하여 적절한 타입을 자동 판단하세요.

## 실행 절차

### 1. 템플릿 읽기

타입에 맞는 템플릿을 읽으세요:
- bug: `docs/issue-queue/_templates/bug.md`
- feature: `docs/issue-queue/_templates/feature.md`
- refactor: `docs/issue-queue/_templates/refactor.md`

### 2. 우선순위 판단

설명을 분석하여 우선순위를 결정하세요:

| 우선순위 | 기준 |
|---------|------|
| `p0` | 서비스 장애, 데이터 손실, 보안 취약점 |
| `p1` | 기능 장애, 잠재적 버그, 핵심 기능 영향 |
| `p2` | 코드 품질, 테스트, 일반 개선 |
| `p3` | 문서, 미세 최적화, nice-to-have |

### 3. 관련 파일 탐색

이슈와 관련된 소스 파일을 탐색하여 `related_files` 필드에 포함하세요.
정확한 파일 경로를 확인하기 위해 `Glob`이나 `Grep`을 사용하세요.

### 4. 파일 생성

**파일명 규칙**: `{priority}-{type}-{slug}.md`
- slug: 영문 kebab-case, 핵심 키워드 2-4단어
- 예: `p1-bug-ws-bridge-no-origin-check.md`

**YAML frontmatter** 모든 필드를 채우세요:
```yaml
---
type: <bug|feature|refactor>
title: "한국어 이슈 제목"
labels: ["bug"] # type에 맞는 기본 라벨 + 추가 라벨 (security, performance 등)
priority: p1
related_files:
  - src/path/to/file.ts
created_by: cloud-llm
created_at: "YYYY-MM-DD"
---
```

**본문**: 템플릿의 각 섹션을 구체적으로 채우세요. 코드 스니펫, 파일 경로, 재현 조건 포함.

### 5. 기존 이슈 중복 확인

생성 전에 `docs/issue-queue/` 폴더를 확인하여 동일한 이슈가 이미 존재하지 않는지 체크하세요.

### 6. 결과 보고

생성한 파일 경로, 제목, 우선순위를 사용자에게 알려주세요.

## 예시

`/queue-issue bug executor에서 금액 검증 누락`

→ `docs/issue-queue/p0-bug-trade-amount-no-validation.md` 생성
