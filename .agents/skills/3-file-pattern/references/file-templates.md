# BOARD/Wiki 템플릿

현재 운영 기준은 `docs/BOARD.md` + `docs/wiki`(=`../pocket-chrome-extension.wiki`)이다.
아래 템플릿은 필요한 항목만 최소 수정한다.

## 1) BOARD Active Task 행 업데이트

```markdown
| 73 | codex-dev | feat/73-board-skill-update | reviewing | 3-file-pattern 스킬 BOARD 기준 정합성 검토 | 2026-02-18 23:40 |
```

규칙:
- 자기 행만 수정한다.
- Status는 `idle|researching|coding|testing|reviewing|blocked` 중 하나를 사용한다.
- 작업 종료 시 `idle`로 되돌리거나 행을 정리한다.

## 2) BOARD Recent Decisions 추가

```markdown
| 2026-02-18 | 3-file-pattern 스킬을 BOARD-first로 전환 | docs/head 제거 이후 문서 운영 기준과 스킬 지침 정합성 확보 |
```

규칙:
- 새 항목을 맨 위에 추가한다.
- 5개 초과 시 오래된 항목은 Wiki `[[Key-Decisions]]`로 이동한다.

## 3) Team Inbox 메시지 append

```markdown
### [2026-02-18] From: Dev — BOARD 상태 갱신 필요
Issue #73 처리 완료. QA 검증 요청.
```

규칙:
- 상대 팀 inbox에 append 한다.
- 처리 완료 후 수신 팀이 삭제한다.

## 4) Wiki Worklog Daily 템플릿(요약)

```markdown
# Daily Worklog - 2026-02-18

## Snapshot
- Date: 2026-02-18
- Owner: codex-dev
- Branch: feat/73-board-skill-update
- Primary Issue: #73

## Highlights
- 

## Decisions
- 

## Next Actions
- 

## References
- docs/BOARD.md
```

자동 생성 명령:
- `npm run wiki:daily`
- `npm run wiki:rollup`

## 5) Worktree 브랜치 생성 템플릿 (항상 선행)

```bash
PROJECT=$(basename "$(git remote get-url origin)" .git)
BRANCH="docs/137-worktree-pr-policy"
SLUG=$(echo "$BRANCH" | sed 's|/|-|g')
WT_PATH=~/worktrees/$PROJECT/$SLUG

mkdir -p ~/worktrees/$PROJECT
git worktree add "$WT_PATH" -b "$BRANCH"
cd "$WT_PATH"
```

규칙:
- 메인 체크아웃이 아닌 `WT_PATH`에서만 수정한다.
- 완료 시 `git push -u origin <branch>` 후 PR을 생성한다.

## 6) 레거시 3-file 예외 템플릿

아래는 `docs/archive/` 복구/분석 작업처럼 예외 상황에서만 사용한다.

### task_plan.md

```markdown
# 작업 계획
- [ ] 범위 확인
- [ ] 작업 수행
- [ ] 검증
```

### findings.md

```markdown
# 발견사항
- (날짜) 핵심 사실
```

### progress.md

```markdown
# 진행 로그
- (최신) 현재 상태
- 다음 행동: ...
```
