# Issue Queue (클라우드 → 로컬 이슈 브릿지)

클라우드 LLM 환경에서는 GitHub API 접근이 불가하므로, 이 폴더에 이슈를 마크다운으로 모아두고
로컬 LLM이 읽어서 GitHub Issue로 생성한 뒤 파일을 삭제하는 방식으로 운영합니다.

## 워크플로우

```
┌─────────────────┐     git push      ┌──────────────────┐
│  Cloud LLM      │ ───────────────► │  GitHub Repo      │
│  (이슈 발견)     │                  │  docs/issue-queue/ │
└─────────────────┘                  └────────┬─────────┘
                                              │ git pull
                                              ▼
                                     ┌──────────────────┐
                                     │  Local LLM       │
                                     │  1. 파일 읽기     │
                                     │  2. gh issue create│
                                     │  3. 파일 삭제     │
                                     │  4. git push      │
                                     └──────────────────┘
```

## 폴더 구조

```
docs/issue-queue/
├── README.md                    # 이 파일 (운영 가이드)
├── _templates/                  # 템플릿 (삭제 대상 아님)
│   ├── bug.md
│   ├── feature.md
│   └── refactor.md
├── p0-bug-example-slug.md       # ← 처리 대상 이슈 파일
├── p1-refactor-example.md
└── ...
```

## 이슈 파일 규칙

### 파일 네이밍

```
{priority}-{type}-{slug}.md
```

| 필드 | 값 | 설명 |
|------|---|------|
| priority | `p0`, `p1`, `p2`, `p3` | p0 긴급 > p3 낮음 |
| type | `bug`, `feature`, `refactor` | GitHub Issue Template 매핑 |
| slug | kebab-case | 이슈 요약 (영문) |

**예시**:
- `p0-bug-trade-amount-no-validation.md`
- `p1-refactor-remove-any-types.md`
- `p2-feature-readme.md`

### YAML Frontmatter

모든 이슈 파일은 YAML frontmatter를 포함해야 합니다.
`_templates/` 폴더의 템플릿을 복사하여 작성하세요.

## 클라우드 LLM 지침 (이슈 작성자)

1. `_templates/`에서 해당 타입의 템플릿을 복사
2. frontmatter의 모든 필수 필드 작성
3. 본문 섹션 채우기
4. `docs/issue-queue/` 루트에 네이밍 규칙에 맞게 저장
5. 커밋 & 푸시

## 로컬 LLM 지침 (이슈 처리자)

1. `docs/issue-queue/` 스캔 (`_templates/`, `README.md` 제외)
2. 우선순위 순서대로 처리 (p0 → p3)
3. 각 파일에 대해:
   ```bash
   # frontmatter의 type에 따라 GitHub Issue 생성
   gh issue create \
     --title "{frontmatter.title}" \
     --label "{frontmatter.labels}" \
     --body "$(본문 마크다운 변환)"

   # 생성된 이슈 번호를 커밋 메시지에 포함하여 파일 삭제
   git rm docs/issue-queue/{파일명}
   git commit -m "[-][issue-queue] #{이슈번호} 이슈 생성 완료: {title}"
   ```
4. 모든 파일 처리 후 `git push`

### 처리 시 주의사항

- `_templates/` 폴더는 절대 삭제하지 말 것
- `README.md`는 삭제하지 말 것
- frontmatter의 `related_files`를 이슈 본문에 포함할 것
- `priority` 필드를 GitHub label로 매핑:
  - `p0` → `priority: critical`
  - `p1` → `priority: high`
  - `p2` → `priority: medium`
  - `p3` → `priority: low`
