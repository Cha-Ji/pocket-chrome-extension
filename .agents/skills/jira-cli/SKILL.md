---
name: jira-cli
description: Jira 이슈 생성, 업데이트, 조회 작업 시 사용. "이슈 만들어줘", "Jira 업데이트", "작업 상태 변경" 등의 요청에 활용.
---

# Jira CLI Skill

Jira 이슈를 커맨드라인에서 관리하기 위한 skill입니다.

## Quick Start

### 1. 환경변수 설정

프로젝트 루트의 `.env` 파일에 다음을 추가합니다:

```bash
# Jira Configuration
JIRA_HOST=auto-trade-extension.atlassian.net
JIRA_USERNAME=your-email@example.com
JIRA_API_TOKEN=your-api-token
```

API 토큰은 https://id.atlassian.com/manage-profile/security/api-tokens 에서 생성할 수 있습니다.

> `.env` 파일은 `.gitignore`에 포함되어 있어 git에 커밋되지 않습니다.

### 2. CLI 사용

```bash
node scripts/jira-cli.cjs <command> [options]
```

## 명령어 레퍼런스

### 이슈 조회 (get)

```bash
node scripts/jira-cli.cjs get SCRUM-1
```

출력 예시:
```
=== SCRUM-1: 프로젝트 초기 설정 ===
타입: Task
상태: Done
담당자: Kong Bee
생성일: 2024-01-15T10:30:00.000Z
```

### 이슈 목록 (list)

```bash
# 기본 (SCRUM 프로젝트, 최근 20개)
node scripts/jira-cli.cjs list

# 상태 필터링
node scripts/jira-cli.cjs list --status="In Progress"

# 프로젝트 지정
node scripts/jira-cli.cjs list --project=PO --max=10
```

### 이슈 생성 (create)

```bash
# 기본 Task 생성
node scripts/jira-cli.cjs create --summary="새 기능 구현"

# Epic 하위 Task 생성
node scripts/jira-cli.cjs create --summary="UI 컴포넌트 개발" --parent=SCRUM-5

# Bug 생성 (라벨 포함)
node scripts/jira-cli.cjs create --summary="로그인 오류 수정" --type=Bug --labels=urgent,frontend

# 설명 포함
node scripts/jira-cli.cjs create --summary="API 연동" --description="백엔드 API와 연동 작업"
```

지원 이슈 타입:
- `Task` (기본값)
- `Epic`
- `Bug`
- `Subtask`

### 상태 변경 (update)

```bash
# 진행 중으로 변경
node scripts/jira-cli.cjs update SCRUM-1 --status="In Progress"

# 완료로 변경
node scripts/jira-cli.cjs update SCRUM-1 --status="Done"
```

### 댓글 추가 (comment)

```bash
node scripts/jira-cli.cjs comment SCRUM-1 --body="작업 완료했습니다. PR: #123"
```

## 워크플로우 가이드

### 1. 새 작업 시작

```bash
# 1. 이슈 생성
node scripts/jira-cli.cjs create --summary="[Feature] 대시보드 차트 추가"

# 2. 브랜치 생성 (컨벤션: jira/<이슈키>)
git checkout -b jira/SCRUM-15

# 3. 상태를 "In Progress"로 변경
node scripts/jira-cli.cjs update SCRUM-15 --status="In Progress"
```

### 2. 작업 완료

```bash
# 1. 커밋 (이슈 키 포함)
git commit -m "feat(dashboard): add chart component

SCRUM-15"

# 2. 댓글로 진행 상황 기록
node scripts/jira-cli.cjs comment SCRUM-15 --body="구현 완료. PR 생성 예정."

# 3. 상태를 "Done"으로 변경
node scripts/jira-cli.cjs update SCRUM-15 --status="Done"
```

### 3. 현재 작업 확인

```bash
# 진행 중인 이슈 확인
node scripts/jira-cli.cjs list --status="In Progress"

# 특정 이슈 상세 확인
node scripts/jira-cli.cjs get SCRUM-15
```

## 프로젝트 정보

- **프로젝트 키**: SCRUM (메인), PO (보조)
- **보드 URL**: https://auto-trade-extension.atlassian.net/jira/software/projects/SCRUM/boards/1

## 참고

- [API Reference](references/api-reference.md) - Jira REST API 상세 정보
- Issue Type IDs: Epic(10001), Subtask(10002), Task(10003), Bug(10004)
