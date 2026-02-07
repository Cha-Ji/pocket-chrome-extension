# Jira → GitHub Issues 마이그레이션 가이드

이 문서는 프로젝트가 **Jira 기반 이슈 관리에서 GitHub Issues로 완전히 전환**되었음을 설명합니다.

## 📋 변경 요약

| 항목 | 이전 (Jira) | 현재 (GitHub) |
|------|-----------|--------------|
| 이슈 관리 | Jira 클라우드 | GitHub Issues |
| 이슈 번호 형식 | `PO-17` | `#17` |
| 커밋 메시지 | `[PO-17][모듈]` | `[#17][모듈]` |
| 브랜치 명명 | `jira/PO-17` | `feat/17-...` |
| 우선순위 | 드롭다운 필드 | 라벨 (`p0`, `p1`, `p2`) |
| 자동화 | Jira CLI | GitHub CLI + Actions |
| 프로젝트 보드 | Jira Board | GitHub Project |

## 🎯 주요 변경사항

### 1. 이슈 번호 형식 변경

**Before:**
```bash
git checkout -b jira/PO-10
git commit -m "[PO-10][data-collector] 실시간 가격 수집"
```

**After:**
```bash
git checkout -b feat/10-real-time-price-collector
git commit -m "[#10][data-collector] 실시간 가격 수집"
```

### 2. 라벨 기반 분류

GitHub의 라벨 체계로 통합:

- **타입 라벨**: `feat`, `bug`, `docs`, `refactor`, `test`, `chore`
- **우선순위 라벨**: `p0` (긴급), `p1` (높음), `p2` (보통), `p3` (낮음)
- **상태 라벨**: `epic`, `blocked`, `duplicate`, `help-wanted`

### 3. 문서화 구조 유지

`.github/ISSUE_TEMPLATE/`의 이슈 템플릿은 동일:
- `feature.yml` → `feat` 라벨 자동 할당
- `bug.yml` → `bug` 라벨 자동 할당
- `refactor.yml` → `refactor` 라벨 자동 할당

### 4. 커밋 컨벤션 업데이트

상세한 커밋 규칙은 `.github/COMMIT_CONVENTION.md` 참고

**변경 항목:**
- `[PO-17]` → `[#17]` (이슈 번호)
- `[-]` → `[-]` (이슈 없는 커밋, 동일)

## 🚀 즉시 실행할 작업

### 1단계: GitHub Labels 초기화

```bash
# 전체 라벨 자동 설정
./.github/init-labels.sh

# 또는 GitHub CLI로 수동 생성
gh label create feat --color 00ff00 --description "신규 기능 추가"
gh label create bug --color ff0000 --description "버그 수정"
# ... (자세한 내용은 .github/LABELS_GUIDE.md 참고)
```

### 2단계: CLAUDE.md 및 문서 확인

```bash
# 변경된 가이드 문서 확인
cat CLAUDE.md | grep -A 20 "GitHub Issues 주도 개발"
cat .github/COMMIT_CONVENTION.md
cat .github/LABELS_GUIDE.md
```

### 3단계: 첫 이슈 생성 테스트

1. GitHub Issues 탭으로 이동
2. "New issue" 클릭
3. `Feature Request` 템플릿 선택
4. `feat` 라벨 자동 확인
5. 우선순위 라벨 추가 (`p1` 등)

## 📖 상세 가이드

### 이슈 생성 프로세스

```
1. GitHub Issues 탭 → New issue
   ↓
2. 템플릿 선택 (Feature, Bug, Refactor)
   ↓
3. 자동 라벨 할당 + 우선순위 라벨 추가
   ↓
4. 이슈 번호 확인 (예: #17)
   ↓
5. 브랜치 생성: git checkout -b feat/17-description
```

### 커밋 및 PR 프로세스

```bash
# 1. 브랜치 생성 (이슈 번호 포함)
git checkout -b feat/17-add-websocket-hook

# 2. 작업 수행 및 커밋
git commit -m "[#17][content-script] WebSocket 후킹 추가

* 구현 내용: Tampermonkey bridge로부터 WS 메시지 수신
* 영향범위: content-script 모듈만
* LLM Context: Implemented WebSocket interception from Tampermonkey bridge..."

# 3. PR 생성 (이슈와 자동 연결)
gh pr create --title "[#17][content-script] WebSocket 후킹 추가" \
             --body "Closes #17"

# 또는 GitHub UI에서 수동 생성
# Closes #17을 PR 본문에 포함 → 자동으로 이슈와 연결됨
```

### 이슈 상태 관리

**GitHub Project 탭 활용:**

```
Project 보드의 칼럼:
┌──────────────────────────────────────┐
│  Backlog  │  In Progress  │  Review  │  Done  │
├──────────────────────────────────────┤
│  새 이슈   │  할당된 이슈   │  PR 제출  │ 닫힘  │
│           │  작업 중      │           │       │
└──────────────────────────────────────┘

상태 변경:
- Issue 생성 → Backlog
- 할당 시작 → In Progress
- PR 생성 → In Review
- PR 병합 → Done
```

## 🔄 GitHub CLI 유용한 명령어

```bash
# 이슈 조회
gh issue list                          # 전체 이슈
gh issue list --label feat             # feat 라벨 이슈만
gh issue list --label bug --label p0   # bug + p0 라벨 이슈

# 특정 이슈 상세 조회
gh issue view 17

# 이슈에 라벨 추가
gh issue edit 17 --add-label feat,p1

# PR 생성
gh pr create --title "제목" --body "Closes #17"

# PR 목록 조회
gh pr list
gh pr list --state draft               # 드래프트 PR만

# 로컬 브랜치와 원격 이슈 연결
git push -u origin feat/17-description
gh pr create --title "제목" --web      # 브라우저에서 생성
```

## 📊 GitHub Project 설정 (선택사항)

### 프로젝트 생성

1. 레포지토리 → **Projects** 탭
2. **New project** 클릭
3. 템플릿 선택: **Table** 또는 **Board**
4. 칼럼 설정:
   - Backlog (새로운 이슈)
   - In Progress (할당됨)
   - In Review (PR 연결됨)
   - Done (닫힘)

### 자동 자동화 (GitHub Actions)

프로젝트의 자동화 규칙:

```yaml
# 이슈가 생성되면 Backlog로 자동 추가
trigger: issue opened
action: Add to project

# PR이 생성되면 In Review로 자동 이동
trigger: pull_request opened
action: Move to In Review

# PR이 병합되면 Done으로 자동 이동
trigger: pull_request merged
action: Move to Done
```

## ⚠️ 마이그레이션 주의사항

### Jira의 남은 것들

- **기존 Jira 이슈**: 필요시 수동으로 GitHub로 재생성 권장
- **Jira CLI 스크립트** (`scripts/jira-cli.cjs`): 더 이상 사용하지 않음
- **Jira 환경 변수** (`.env`): 자동으로 `.gitignore`에 포함됨

### Git 히스토리

이미 커밋된 `[PO-XX]` 형식의 커밋들:
- ✅ 그대로 유지 (히스토리 보존)
- 새로운 커밋부터 `[#XX]` 형식 사용

### 기존 이슈 참조

```bash
# 이전: Jira 대시보드
# https://auto-trade-extension.atlassian.net/jira/software/projects/PO

# 현재: GitHub Issues
# https://github.com/yourusername/pocket-chrome-extension/issues

# 이전 이슈 필요 시:
# README에 "### Legacy Issues (Jira)" 섹션 추가 가능
```

## 🎓 팀원 교육 체크리스트

모든 팀원이 다음을 이해하도록 확인:

- [ ] GitHub Issues 탭에서 이슈 생성 가능
- [ ] 이슈 템플릿 선택 및 작성 가능
- [ ] 라벨 추가 방법 숙지 (`feat`, `bug`, `p0` 등)
- [ ] 커밋 메시지 형식 변경 이해 (`[#17]` 형식)
- [ ] PR 생성 시 이슈와 연결 방법 숙지 (`Closes #17`)
- [ ] GitHub CLI 기본 명령어 이해 (선택)
- [ ] Project 탭 보드 사용 방법 (선택)

## 📞 문제 해결

### Q: 이전 Jira 이슈를 GitHub로 옮길 수 있나?
**A**: 수동 마이그레이션만 가능. 중요한 이슈는 다시 생성 권장.

### Q: PR이 이슈와 자동으로 연결되지 않음
**A**: PR 본문에 정확히 `Closes #17` 포함 확인. 대소문자 민감.

### Q: 라벨이 보이지 않음
**A**: `.github/init-labels.sh` 실행하여 라벨 초기화.

### Q: GitHub CLI 설치 안 하고도 이슈 관리 가능?
**A**: 네. GitHub UI에서 모든 작업 가능 (CLI는 자동화 목적).

## 📚 참고 문서

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 가이드라인 (수정됨)
- [COMMIT_CONVENTION.md](.github/COMMIT_CONVENTION.md) - 커밋 규칙 (수정됨)
- [LABELS_GUIDE.md](.github/LABELS_GUIDE.md) - 라벨 상세 가이드
- [PR_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) - PR 템플릿 (수정됨)
- [ISSUE_TEMPLATE/](..ISSUE_TEMPLATE/) - 이슈 템플릿 (수정됨)

---

**마이그레이션 완료**: 2026-02-07

**주요 변경사항**:
1. ✅ CLAUDE.md: Jira → GitHub Issues
2. ✅ COMMIT_CONVENTION.md: `[PO-17]` → `[#17]`
3. ✅ PR_TEMPLATE.md: 라벨 섹션 추가
4. ✅ ISSUE_TEMPLATE 개선: 라벨 및 우선순위 추가
5. ✅ LABELS_GUIDE.md: 라벨 체계 상세 가이드
6. ✅ labels.json: 자동 라벨 초기화 구성

