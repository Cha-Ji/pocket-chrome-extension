# Git CLI 명령어 상세 레퍼런스

## 기본 명령어

### status

현재 브랜치와 변경 상태를 요약 출력합니다.

```bash
node scripts/git-cli.cjs status
```

**내부 동작:**
- `git branch --show-current` - 현재 브랜치
- `git status --porcelain` - 변경 파일 목록

**출력 최적화:**
- staged/unstaged/untracked 개수 요약
- 각 카테고리 최대 10개만 표시
- 초과분은 `... +N more`로 표시

---

### diff

변경사항을 `--stat` 형식으로 요약합니다.

```bash
node scripts/git-cli.cjs diff [options]
```

**옵션:**

| 옵션 | 설명 |
|------|------|
| `--staged` | 스테이징된 변경사항만 |
| `--file=<path>` | 특정 파일만 |
| `--detail` | 상세 diff 포함 (최대 100줄) |

**내부 동작:**
- `git diff --stat` (기본)
- `git diff --cached --stat` (staged)
- `git diff` (detail 옵션 시)

---

### log

커밋 히스토리를 간결하게 출력합니다.

```bash
node scripts/git-cli.cjs log [options]
```

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--max=<n>` | 20 | 최대 커밋 수 |
| `--author=<name>` | - | 작성자 필터 |
| `--since=<date>` | - | 시작 날짜 |
| `--until=<date>` | - | 종료 날짜 |
| `--no-graph` | - | 그래프 비활성화 |
| `--no-oneline` | - | 전체 형식 |

**내부 동작:**
```bash
git log --oneline --graph -n <max> [--author=<name>] [--since=<date>] [--until=<date>]
```

---

### commit

Conventional Commits 형식으로 커밋을 생성합니다.

```bash
node scripts/git-cli.cjs commit [options]
```

**옵션:**

| 옵션 | 설명 |
|------|------|
| `--message=<msg>`, `-m` | 커밋 메시지 |
| `--all`, `-a` | 모든 변경사항 자동 스테이징 |

**메시지 없이 실행 시:**
1. 스테이징된 변경사항 분석
2. 변경 파일 기반 타입 추천 (feat, fix, docs, test 등)
3. 디렉토리 기반 스코프 추천

---

### push

원격 저장소에 푸시합니다.

```bash
node scripts/git-cli.cjs push [options]
```

**옵션:**

| 옵션 | 설명 |
|------|------|
| `--force`, `-f` | 강제 푸시 |
| `-u`, `--set-upstream` | 업스트림 설정 |
| `--remote=<name>` | 원격 이름 (기본: origin) |
| `--branch=<name>` | 브랜치 이름 (기본: 현재 브랜치) |

**안전 기능:**
- 커밋되지 않은 변경사항 경고
- 원격 브랜치 미존재 시 자동 `-u` 추가

---

## GitHub PR 명령어

gh CLI가 설치되어 있어야 합니다.

### pr-create

Pull Request를 생성합니다.

```bash
node scripts/git-cli.cjs pr-create [options]
```

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--title=<title>`, `-t` | - | PR 제목 (필수) |
| `--body=<body>`, `-b` | - | PR 설명 |
| `--base=<branch>` | main | 대상 브랜치 |
| `--draft`, `-d` | false | 드래프트로 생성 |

**제목 없이 실행 시:**
- 현재 브랜치 정보 표시
- 최근 커밋 메시지 표시
- 사용법 안내

---

### pr-list

PR 목록을 조회합니다.

```bash
node scripts/git-cli.cjs pr-list [options]
```

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--state=<state>` | open | 상태 (open, closed, merged, all) |
| `--max=<n>` | 20 | 최대 개수 |

**출력 필드:**
- PR 번호, 제목, 상태
- 작성자, 수정일

---

### pr-view

PR 상세 정보를 조회합니다.

```bash
node scripts/git-cli.cjs pr-view <number>
```

**출력 필드:**
- 번호, 제목, 상태
- 브랜치 (head → base)
- 작성자
- 변경사항 (+additions, -deletions, files)
- 리뷰 상태
- 수정일
- 설명 (최대 10줄)

---

### pr-merge

PR을 머지합니다.

```bash
node scripts/git-cli.cjs pr-merge <number> [options]
```

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--method=<method>` | merge | 머지 방법 |
| `--delete-branch`, `-d` | false | 머지 후 브랜치 삭제 |

**머지 방법:**
- `merge` - 머지 커밋 생성
- `squash` - 스쿼시 머지 (권장)
- `rebase` - 리베이스 머지

---

### pr-review

PR을 리뷰합니다.

```bash
node scripts/git-cli.cjs pr-review <number> [options]
```

**옵션:**

| 옵션 | 설명 |
|------|------|
| `--approve`, `-a` | 승인 |
| `--request-changes`, `-r` | 변경 요청 |
| `--comment`, `-c` | 코멘트만 |
| `--body=<text>`, `-b` | 리뷰 메시지 |

**옵션 없이 실행 시:**
- PR diff 요약 (`--stat`)
- 사용 가능한 옵션 안내

---

## gh CLI 관련

### 설치

```bash
# Windows (winget)
winget install GitHub.cli

# Windows (scoop)
scoop install gh

# Windows (Chocolatey)
choco install gh
```

### 인증

```bash
gh auth login
```

프롬프트에 따라:
1. GitHub.com 선택
2. HTTPS 선택
3. 브라우저로 인증 또는 토큰 입력

### 인증 상태 확인

```bash
gh auth status
```

---

## 토큰 최적화 전략

이 스크립트는 LLM 토큰 사용량을 최소화하도록 설계되었습니다:

1. **출력 압축**
   - `git log --oneline` 형식
   - `git diff --stat` 요약
   - 파일 목록 최대 10개

2. **필드 선택**
   - gh 명령어 `--json` 옵션으로 필요한 필드만 추출
   - 불필요한 메타데이터 제거

3. **줄 수 제한**
   - diff detail: 최대 100줄
   - PR 설명: 최대 10줄
   - 파일 목록: 최대 10개

4. **중복 제거**
   - 불필요한 공백 제거
   - 장식 문자 최소화
