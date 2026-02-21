# PR Creation Instructions

Branch `claude/review-consolidate-issues-SAY5G` has been pushed with all 15 issue commits.

## Create PR locally

```bash
gh pr create \
  --repo Cha-Ji/pocket-chrome-extension \
  --title "chore: issue sweep (2026-02-17)" \
  --body-file docs/issue-sweep/2026-02-17/PR-BODY.md \
  --base main \
  --head claude/review-consolidate-issues-SAY5G
```

## Or via GitHub UI

1. Go to https://github.com/Cha-Ji/pocket-chrome-extension/pull/new/claude/review-consolidate-issues-SAY5G
2. Set base: `main`, compare: `claude/review-consolidate-issues-SAY5G`
3. Copy PR body from `docs/issue-sweep/2026-02-17/PR-BODY.md`
