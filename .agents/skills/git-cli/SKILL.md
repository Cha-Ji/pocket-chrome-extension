---
name: git-cli
description: Git/GitHub 작업 시 사용. commit, log, push, PR 생성/머지/리뷰 등. "커밋해줘", "PR 만들어줘", "로그 확인" 요청에 활용.
---

# Git CLI Skill

토큰 최적화된 Git/GitHub 작업 도구입니다. 출력을 압축하여 LLM 컨텍스트를 절약합니다.

## 플랫폼 지원

| 플랫폼 | git 명령어 | gh 명령어 (PR 관련) |
|--------|-----------|-------------------|
| Windows | 네이티브 git | **WSL Ubuntu를 통해 실행** |
| macOS/Linux | 네이티브 | 네이티브 |

> **Windows 사용자 필수**: PR 관련 기능(pr-create, pr-list, pr-view, pr-merge, pr-review)은 **WSL Ubuntu**의 gh CLI를 사용합니다. WSL Ubuntu에 gh를 설치하고 인증하세요. 스크립트가 자동으로 `wsl -d Ubuntu`를 통해 gh를 호출합니다.

## Quick Start

### 1. gh CLI 설치 (PR 기능 사용 시 필요)

**Windows (WSL에서 설치 - 필수)**
```bash
# WSL 터미널에서 실행
sudo apt update && sudo apt install gh  # Ubuntu/Debian

# 또는 Homebrew 사용 시
brew install gh

# 설치 후 인증 (WSL에서)
gh auth login
```

**macOS/Linux**
```bash
brew install gh       # macOS
sudo apt install gh   # Ubuntu/Debian

# 설치 후 인증
gh auth login
```

### 2. CLI 사용

```bash
node scripts/git-cli.cjs <command> [options]
```

## 명령어 레퍼런스

### status (변경 상태 요약)

```bash
node scripts/git-cli.cjs status
```

출력 예시:
```
=== feature/my-branch ===
staged: 2, unstaged: 1, untracked: 3

[Staged]
  M  src/index.ts
  A  src/utils.ts
```

### diff (변경사항 요약)

```bash
# 워킹 디렉토리 변경사항
node scripts/git-cli.cjs diff

# 스테이징된 변경사항
node scripts/git-cli.cjs diff --staged

# 특정 파일
node scripts/git-cli.cjs diff --file=src/index.ts

# 상세 diff 포함
node scripts/git-cli.cjs diff --staged --detail
```

### log (커밋 히스토리)

```bash
# 기본 (최근 20개)
node scripts/git-cli.cjs log

# 개수 제한
node scripts/git-cli.cjs log --max=10

# 작성자 필터
node scripts/git-cli.cjs log --author="username"

# 날짜 필터
node scripts/git-cli.cjs log --since="2024-01-01" --until="2024-12-31"
```

### commit (커밋 생성)

```bash
# 메시지 없이 실행 → 제안 받기
node scripts/git-cli.cjs commit

# Conventional Commits 형식으로 커밋
node scripts/git-cli.cjs commit --message="feat(ui): add button component"

# 모든 변경사항 자동 스테이징
node scripts/git-cli.cjs commit -a --message="fix: resolve bug"
```

### push (원격 푸시)

```bash
# 기본 푸시
node scripts/git-cli.cjs push

# 업스트림 설정 (새 브랜치)
node scripts/git-cli.cjs push -u

# 강제 푸시 (주의!)
node scripts/git-cli.cjs push --force
```

### pr-create (PR 생성)

```bash
# 제목 없이 실행 → 정보 확인
node scripts/git-cli.cjs pr-create

# PR 생성
node scripts/git-cli.cjs pr-create --title="feat: new feature" --base=main

# 설명 포함
node scripts/git-cli.cjs pr-create --title="fix: bug" --body="버그 수정 내용"

# 드래프트로 생성
node scripts/git-cli.cjs pr-create --title="wip: work in progress" --draft
```

### pr-list (PR 목록)

```bash
# 열린 PR
node scripts/git-cli.cjs pr-list

# 모든 PR
node scripts/git-cli.cjs pr-list --state=all

# 개수 제한
node scripts/git-cli.cjs pr-list --max=5
```

### pr-view (PR 상세)

```bash
node scripts/git-cli.cjs pr-view 123
```

### pr-merge (PR 머지)

```bash
# 기본 머지
node scripts/git-cli.cjs pr-merge 123

# 스쿼시 머지
node scripts/git-cli.cjs pr-merge 123 --method=squash

# 머지 후 브랜치 삭제
node scripts/git-cli.cjs pr-merge 123 --delete-branch
```

### pr-review (PR 리뷰)

```bash
# 리뷰 정보 확인
node scripts/git-cli.cjs pr-review 123

# 승인
node scripts/git-cli.cjs pr-review 123 --approve

# 변경 요청
node scripts/git-cli.cjs pr-review 123 --request-changes --body="수정 필요"

# 코멘트
node scripts/git-cli.cjs pr-review 123 --comment --body="확인했습니다"
```

## 워크플로우 가이드

### 1. 새 기능 개발

```bash
# 1. 브랜치 생성
git checkout -b feature/new-feature

# 2. 작업 후 상태 확인
node scripts/git-cli.cjs status

# 3. 커밋
git add .
node scripts/git-cli.cjs commit --message="feat(module): add new feature"

# 4. 푸시
node scripts/git-cli.cjs push -u

# 5. PR 생성
node scripts/git-cli.cjs pr-create --title="feat: add new feature"
```

### 2. PR 리뷰 & 머지

```bash
# 1. PR 목록 확인
node scripts/git-cli.cjs pr-list

# 2. PR 상세 확인
node scripts/git-cli.cjs pr-view 123

# 3. 리뷰
node scripts/git-cli.cjs pr-review 123 --approve --body="LGTM"

# 4. 머지
node scripts/git-cli.cjs pr-merge 123 --method=squash --delete-branch
```

## Conventional Commits

지원 타입:

| 타입 | 용도 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `style` | 코드 스타일 (포맷팅 등) |
| `refactor` | 리팩토링 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정 등 기타 |

형식:
```
<type>(<scope>): <subject>

<body>

<footer>
```

## 참고

- [명령어 상세 옵션](references/commands.md)
