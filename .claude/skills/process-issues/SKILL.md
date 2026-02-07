---
name: process-issues
description: Issue Queue의 이슈들을 GitHub Issue로 생성하고 파일을 삭제합니다. gh CLI 인증이 필요합니다.
argument-hint: "[--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Bash, Glob, Grep
---

# Issue Queue 처리 (로컬 LLM 전용)

`docs/issue-queue/`에 쌓인 이슈 파일들을 읽어서 GitHub Issue로 생성하고, 처리 완료된 파일을 삭제합니다.

## 전제조건

- `gh` CLI가 설치되어 있고 인증 완료 (`gh auth status`)
- git 작업 디렉토리가 clean 상태

## 입력

- `$ARGUMENTS`에 `--dry-run`이 포함되면 실제 이슈를 생성하지 않고 미리보기만 합니다.

## 실행 절차

### 1. 사전 점검

```bash
gh auth status
git status
```

gh 인증이 안 되어 있으면 사용자에게 `gh auth login` 안내 후 중단하세요.
git 워킹 디렉토리에 uncommitted 변경이 있으면 경고하세요.

### 2. 이슈 파일 스캔

`docs/issue-queue/` 루트의 `p[0-3]-*.md` 파일들을 수집합니다.
`_templates/`와 `README.md`는 제외합니다.

**처리 순서**: 파일명 알파벳순 (= 우선순위순: p0 → p3)

### 3. 각 이슈 파일 처리

파일별로 다음을 수행합니다:

#### 3-1. YAML Frontmatter 파싱

필수 필드 확인:
- `type`: bug | feature | refactor
- `title`: 이슈 제목 (비어있으면 스킵)
- `labels`: 라벨 배열
- `priority`: p0-p3

#### 3-2. GitHub Label 매핑

frontmatter의 labels에 priority label을 추가:
- `p0` → `priority: critical` 추가
- `p1` → `priority: high` 추가
- `p2` → `priority: medium` 추가
- `p3` → `priority: low` 추가

#### 3-3. 본문 변환

YAML frontmatter 이후의 마크다운 본문을 그대로 사용합니다.
본문 끝에 메타데이터를 추가하세요:

```markdown
---
> *Created from issue-queue by LLM*
> *Source: `docs/issue-queue/{파일명}`*
> *Priority: {priority}*
```

#### 3-4. GitHub Issue 생성

```bash
gh issue create \
  --title "{title}" \
  --label "{label1}" --label "{label2}" \
  --body "{변환된 본문}"
```

생성 성공 시 반환된 이슈 URL을 기록합니다.

**--dry-run 모드**에서는 이 단계를 건너뛰고 생성될 이슈 내용만 출력합니다.

#### 3-5. 파일 삭제 및 커밋

```bash
git rm docs/issue-queue/{파일명}
git commit -m "[-][issue-queue] #{이슈번호} 이슈 생성 완료: {title}"
```

### 4. 최종 보고

처리 결과 테이블을 출력하세요:

| 파일 | 제목 | 우선순위 | GitHub Issue | 상태 |
|------|------|---------|-------------|------|
| p0-bug-xxx.md | 제목 | p0 | #42 | 성공 |
| p1-refactor-yyy.md | 제목 | p1 | - | 실패 (사유) |

### 5. Push

모든 처리가 끝나면 사용자에게 `git push` 여부를 확인하세요.

## 대안: 스크립트 실행

수동으로 처리할 수도 있습니다:

```bash
# 미리보기
./scripts/process-issue-queue.sh --dry-run

# 실제 실행
./scripts/process-issue-queue.sh
```

## 에러 처리

- label이 존재하지 않으면 `--label` 없이 재시도
- rate limit 발생 시 60초 대기 후 재시도
- 한 파일 실패 시 다음 파일로 계속 진행 (실패 파일은 큐에 남겨둠)
