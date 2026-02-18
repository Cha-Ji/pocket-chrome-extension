---
name: wiki-worklog
description: Wiki Worklog(일간/주간/월간) 운영 자동화를 위한 스킬. 작업일지 작성, Daily→Weekly→Monthly 롤업, wiki 저장소 상태 확인/커밋 분리를 수행할 때 사용.
---

# Wiki Worklog Skill

`docs/BOARD.md`는 실시간 상태판으로 유지하고, 작업 이력은 `../pocket-chrome-extension.wiki/Worklog`에 저장한다.

이 스킬은 아래 요청에서 사용한다:
- "작업일지 남겨줘"
- "daily/weekly/monthly 아카이브 돌려줘"
- "wiki worklog 롤업해줘"
- "이번 주/월 작업 요약해줘"

## Source of Truth

- 상태판: `docs/BOARD.md`
- 이력/회고: `../pocket-chrome-extension.wiki/Worklog`
- 자동화 스크립트: `scripts/wiki-rollup.sh`
- npm 명령:
  - `npm run wiki:daily`
  - `npm run wiki:rollup:weekly`
  - `npm run wiki:rollup:monthly`
  - `npm run wiki:rollup`
  - `npm run wiki:rollup:dry`

## 운영 규칙

1. Daily 작성:
- 최소 1일 1파일 (`Worklog/Daily/YYYY/YYYY-MM-DD.md`)
- 이슈/PR/커밋 링크 중심으로 기록

2. Weekly 롤업:
- 7일 경과한 Daily를 Weekly로 롤업
- 원본 Daily는 `Worklog/Daily/archive/YYYY/`로 이동

3. Monthly 롤업:
- 1개월 경과한 Weekly를 Monthly로 롤업
- 원본 Weekly는 `Worklog/Weekly/archive/YYYY/`로 이동

4. 보안:
- 토큰/API key/개인정보 기록 금지
- 민감값은 링크나 요약만 남김

## 실행 절차

### 1) 사전 점검

```bash
ls -la ../pocket-chrome-extension.wiki
git -C ../pocket-chrome-extension.wiki status --short
```

### 2) 일간 기록 생성 또는 확인

```bash
npm run wiki:daily
```

특정 날짜 생성:

```bash
bash scripts/wiki-rollup.sh daily YYYY-MM-DD
```

### 3) 롤업 실행

```bash
npm run wiki:rollup
```

미리보기:

```bash
npm run wiki:rollup:dry
```

### 4) 결과 검증

```bash
find ../pocket-chrome-extension.wiki/Worklog -maxdepth 4 -type f | sort
git -C ../pocket-chrome-extension.wiki status --short
```

## 커밋 규칙

worklog 변경은 **wiki 저장소에서 별도 커밋**한다.

```bash
git -C ../pocket-chrome-extension.wiki add Worklog.md Worklog Home.md _Sidebar.md
git -C ../pocket-chrome-extension.wiki commit -m "docs(worklog): update daily/weekly/monthly logs"
```

메인 저장소 변경(`scripts/wiki-rollup.sh`, `package.json`, `docs/BOARD.md`, `CLAUDE.md`)은 메인 저장소에서 커밋한다.

## 실패 시 대응

1. `../pocket-chrome-extension.wiki` 경로가 없으면:
- `WIKI_DIR` 환경변수로 경로 지정 후 실행

```bash
WIKI_DIR=/abs/path/to/wiki bash scripts/wiki-rollup.sh run
```

2. 롤업 중복이 의심되면:
- Weekly/Monthly 파일의 `source-daily`, `source-weekly` 마커를 확인

3. 날짜 경계 이슈가 있으면:
- `--dry-run`으로 먼저 검증 후 실행

