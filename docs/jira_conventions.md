# JIRA & Git Ground Rules

## 1. JIRA Issue Conventions

### 🏷 Title Format
`[<소제목>] <설명>`
- 예: `[Panel] 성과 대시보드 UI 고도화`
- 예: `[Core] 텔레그램 알림 API 예외 처리`

### 📝 Description Template
이슈 생성 시 내용은 간결하게 요약합니다.
```markdown
**요약**: <작업 내용 요약>
**수락 기준**:
- [ ] 기준 1
- [ ] 기준 2
```

## 2. Git Workflow & Conventions

### 🌿 Branch Naming
JIRA 이슈 작업 시 반드시 전용 브랜치를 생성합니다.
- **Format**: `jira/<이슈키>`
- 예: `jira/SCRUM-12`

### 🔄 PR & Merge Flow
1. `main` 브랜치에서 `jira/<이슈키>` 브랜치 생성.
2. 작업 완료 후 `main`으로 Pull Request(PR) 생성.
3. 리뷰 및 자가 검토 후 `main`으로 Merge.
4. Merge 완료 후 로컬 및 원격의 작업 브랜치 삭제.

### 💬 Commit Message Format (Conventional Commits)
`<type>(<scope>): <subject> [#<이슈키>]`
- **feat**: 새로운 기능 추가
- **fix**: 버그 수정
- **docs**: 문서 수정
- **style**: 코드 포맷팅 (로직 변경 없음)
- **refactor**: 코드 리팩토링
- **test**: 테스트 코드 추가/수정
- **chore**: 빌드 업무, 패키지 매니저 설정 등
- *예시*: `feat(panel): 대시보드 그래프 컴포넌트 추가 [#SCRUM-12]`

## 3. Documentation (3-File Pattern)
모든 "In Progress" 이슈는 다음 폴더 구조를 유지합니다.
- **Path**: `docs/issues/<이슈키>/`
  1. `task_plan.md`: 해당 이슈를 위한 마이크로 플랜.
  2. `findings.md`: 기술적 난관, 결정 사항, 배운 점.
  3. `progress.md`: 일일 진행 로그.
