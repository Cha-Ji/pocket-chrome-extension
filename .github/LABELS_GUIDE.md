# GitHub Labels 설정 가이드

이 프로젝트는 이슈와 PR을 효율적으로 관리하기 위해 표준화된 라벨 체계를 사용합니다.

## 라벨 설정 방법

### 1. 자동 설정 (권장)

GitHub CLI를 사용하여 자동으로 라벨을 설정할 수 있습니다.

```bash
# 사전 준비: GitHub CLI 설치
# https://cli.github.com/

# 프로젝트 디렉토리에서 실행
gh label create feat --color 00ff00 --description "신규 기능 추가"
gh label create bug --color ff0000 --description "버그 수정"
gh label create docs --color 0000ff --description "문서 작성/수정"
gh label create refactor --color ffaa00 --description "코드 정리 및 구조 개선"
gh label create test --color aa00ff --description "테스트 코드 추가/수정"
gh label create chore --color 333333 --description "패키지, 설정, CI/CD 변경"
gh label create p0 --color ff0000 --description "긴급 (서비스 장애)"
gh label create p1 --color ffaa00 --description "높음 (기능 장애)"
gh label create p2 --color ffff00 --description "보통 (불편)"
gh label create p3 --color cccccc --description "낮음 (개선)"
gh label create wontfix --color cccccc --description "수정하지 않음"
gh label create duplicate --color cccccc --description "중복된 이슈"
gh label create epic --color 3366cc --description "대규모 작업 (여러 이슈 포함)"
gh label create blocked --color ff6666 --description "다른 작업 대기 중"
gh label create help-wanted --color 33aa33 --description "도움 요청"
```

### 2. 수동 설정

GitHub 웹 UI를 통해 설정할 수도 있습니다:

1. 레포지토리 → **Issues** → **Labels** 클릭
2. **New label** 버튼 클릭
3. 아래 테이블의 정보 입력
4. **Create label** 클릭

## 라벨 분류

### 📌 타입 라벨 (이슈 템플릿에서 자동 할당)

| 라벨 | 색상 | 설명 | 사용 기준 |
|------|------|------|----------|
| `feat` | 🟢 `#00ff00` | 신규 기능 | 새로운 기능/UI 추가 |
| `bug` | 🔴 `#ff0000` | 버그 수정 | 기존 기능의 문제 수정 |
| `docs` | 🔵 `#0000ff` | 문서 | README, CLAUDE.md 등 |
| `refactor` | 🟠 `#ffaa00` | 리팩토링 | 기능 유지, 구조 개선 |
| `test` | 🟣 `#aa00ff` | 테스트 | 테스트 코드 추가/수정 |
| `chore` | ⚫ `#333333` | 잡무 | 패키지, 설정, CI/CD |

### 🎯 우선순위 라벨 (필수로 추가)

| 라벨 | 색상 | 설명 | 사용 기준 |
|------|------|------|----------|
| `p0` | 🔴 `#ff0000` | 긴급 | 서비스 완전 중단 |
| `p1` | 🟠 `#ffaa00` | 높음 | 주요 기능 장애 |
| `p2` | 🟡 `#ffff00` | 보통 | 부분 기능 장애 |
| `p3` | ⚫ `#cccccc` | 낮음 | 편의성 개선 |

### 🔄 상태 라벨 (프로젝트 탭에서 추가)

| 라벨 | 색상 | 설명 | 사용 기준 |
|------|------|------|----------|
| `epic` | 🔵 `#3366cc` | 대규모 작업 | 여러 이슈를 포함하는 작업 |
| `blocked` | 🔴 `#ff6666` | 차단됨 | 다른 작업 완료 대기 |
| `wontfix` | ⚫ `#cccccc` | 수정 안함 | 기능이 아닌 설계 결정 |
| `duplicate` | ⚫ `#cccccc` | 중복 | 다른 이슈와 동일 |
| `help-wanted` | 🟢 `#33aa33` | 도움 요청 | 추가 검토/제안 필요 |

## 라벨 사용 규칙

### 이슈 생성 시

1. **이슈 템플릿 선택** → 자동으로 타입 라벨 할당
   - `feat` (feature.yml)
   - `bug` (bug.yml)
   - `refactor` (refactor.yml)

2. **우선순위 라벨 추가** (필수)
   - `p0`, `p1`, `p2`, `p3` 중 선택

3. **추가 라벨** (선택사항)
   - `blocked`: 작업이 다른 이슈를 기다리는 경우
   - `help-wanted`: 검토나 의견이 필요한 경우

### PR 생성 시

1. **자동 연결된 이슈의 라벨 상속**
2. **추가 라벨 가능**
   - 예: `feat` + `p1` (높은 우선순위 기능)

### 예시

```markdown
# 좋은 라벨 조합
feat + p0           → 긴급 신규 기능
bug + p1            → 높은 우선순위 버그 수정
refactor + blocked  → 다른 작업 대기 중인 리팩토링

# 피해야 할 조합
feat + bug          → 타입 라벨은 1개만
refactor + p1 + p2  → 우선순위는 1개만
```

## GitHub Project와의 연계

### Project 탭 설정

이슈 라벨을 프로젝트 상태로 자동 변환할 수 있습니다:

```
상태 칼럼           → 라벨 매핑
─────────────────────────────
Backlog             → 새로운 이슈
In Progress         → 할당됨 + 진행 중
In Review           → PR 링크됨
Done                → Closed
```

### Workflow 자동화 (선택사항)

GitHub Actions를 사용하여 라벨 기반 자동화 가능:

```yaml
name: Auto-label Issues
on: [issues]
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: github/issue-labeler@v2.1
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
```

## 라벨 검색

### 특정 라벨의 이슈 찾기

```bash
# GitHub CLI
gh issue list --label feat
gh issue list --label bug --label p0

# GitHub UI
# Issues → Filter by: label:feat
# 복수 라벨: label:feat label:p0
```

### 라벨 없는 이슈 찾기

```bash
# GitHub CLI
gh issue list -S "no:label"

# GitHub UI
# Issues → Filter by: no:label
```

## 참고사항

- 라벨은 프로젝트 설정에서 언제든 추가/수정/삭제 가능
- 기존 이슈에 라벨을 추가해도 히스토리가 남음
- 라벨 색상은 일관성을 위해 변경하지 않기 권장
- 라벨 이름은 영어 소문자 + 하이픈 (예: `help-wanted`)

---

**초기화 명령어**:

모든 라벨을 한 번에 초기화하려면 다음 스크립트를 실행하세요:

```bash
#!/bin/bash
# init-labels.sh

LABELS=(
  "feat:00ff00:신규 기능 추가"
  "bug:ff0000:버그 수정"
  "docs:0000ff:문서 작성/수정"
  "refactor:ffaa00:코드 정리 및 구조 개선"
  "test:aa00ff:테스트 코드 추가/수정"
  "chore:333333:패키지, 설정, CI/CD 변경"
  "p0:ff0000:긴급 (서비스 장애)"
  "p1:ffaa00:높음 (기능 장애)"
  "p2:ffff00:보통 (불편)"
  "p3:cccccc:낮음 (개선)"
  "epic:3366cc:대규모 작업"
  "blocked:ff6666:다른 작업 대기 중"
  "wontfix:cccccc:수정하지 않음"
  "duplicate:cccccc:중복된 이슈"
  "help-wanted:33aa33:도움 요청"
)

for label in "${LABELS[@]}"; do
  IFS=':' read -r name color desc <<< "$label"
  gh label create "$name" --color "$color" --description "$desc" 2>/dev/null || true
done

echo "✓ 모든 라벨이 초기화되었습니다!"
```

사용법:
```bash
chmod +x .github/init-labels.sh
./.github/init-labels.sh
```
