# JIRA Project Template & Migration Plan

## 📅 2026-01-31

### 1. Project Configuration
- **Project Name**: 내 소프트웨어 팀 (To be renamed to "Pocket Quant Trader")
- **Key**: SCRUM
- **Type**: Team-managed Software (Next-gen)
- **URL**: `https://auto-trade-extension.atlassian.net/jira/software/projects/SCRUM/boards/1`

### 2. Issue Type Mapping
기존 `task_plan.md`의 항목들을 아래와 같이 매핑합니다.

| Markdown | JIRA Issue Type | Status | Description |
|----------|----------------|--------|-------------|
| `## Phase X` | **Epic** | In Progress / Done | 페이즈 단위 그룹핑 |
| `- [ ] Task` | **Task** | To Do | 일반 작업 |
| `- [x] Task` | **Task** | Done | 완료된 작업 |
| `- [ ] Bug` | **Bug** | To Do | 버그 수정 |

### 3. Workflow Configuration
Team-managed 프로젝트의 기본 워크플로우를 사용합니다.
- **To Do**: 할 일 (`[ ]`)
- **In Progress**: 진행 중 (`[~]` or Active)
- **Done**: 완료 (`[x]`)

### 4. Component / Label Strategy
복잡한 컴포넌트 설정 대신 **Label**을 적극 활용하여 토큰을 절약합니다.
- `ContentScript`, `SidePanel`, `Strategy`, `Backend`

### 5. Migration Strategy (Scripted)
수작업 대신 `scripts/migrate-to-jira.js` 스크립트를 작성하여 일괄 등록합니다.
1. `docs/task_plan.md` 파싱.
2. 헤더(`##`)를 감지하여 **Epic** 생성 (또는 라벨링).
3. 체크박스 항목을 **Task**로 생성.
4. 상태(`[x]`)에 따라 Transition 적용.

### 6. Future Management Rule
- **새 작업**: JIRA에서 Issue 생성 -> Key 발급 -> 브랜치 생성 (`feat/SCRUM-123-asset-switch`).
- **작업 완료**: PR 생성 시 JIRA Key 명시 -> Merge 시 자동 Close (GitHub 연동 권장).
