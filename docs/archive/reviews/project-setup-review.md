# 프로젝트 구조 및 설정 검토 보고서

**검토일**: 2026-02-06
**검토 범위**: 프로젝트 구조, CLAUDE.md, GitHub 설정, 빌드/테스트 설정

---

## 1. 구조상 허점 분석

### CRITICAL

#### 1-1. 레거시/중복 디렉토리 방치

동일 역할의 디렉토리가 2개씩 존재:

| 활성 모듈 | 레거시 (죽은 코드) |
|-----------|-------------------|
| `src/side-panel/` | `src/sidepanel/` (7개 파일) |
| `src/content-script/` | `src/content/` (3개 파일) |
| `src/lib/db/` | `src/database/` (1개 파일) |

LLM이 정본을 혼동하여 잘못된 파일을 수정할 위험.

#### 1-2. ESLint 설정 파일 부재

`eslint ^9.18.0` 설치 + `npm run lint` 스크립트 존재하나 설정 파일 없음.
실행 시 기본 규칙만 적용되어 사실상 무의미.

#### 1-3. CI/CD 완전 부재

`.github/workflows/` 없음. PR 머지 시 테스트/린트/타입체크/빌드 자동 검증 불가.

#### 1-4. 대용량 데이터 파일이 Git에 포함

`.gitignore`에 `data/` 미포함. 8.3MB 시장 데이터 + SQLite DB가 저장소에 커밋됨.

### HIGH

#### 1-5. 버전 불일치

- `package.json`: `0.2.0`
- `manifest.json`: `0.1.0`

#### 1-6. `web_accessible_resources`가 `<all_urls>`

`inject-websocket.js`가 모든 URL에 노출. Pocket Option 도메인으로 제한 필요.

#### 1-7. 전략 파일 버전 폭발

`strategies.ts`, `strategies-v2.ts`, `strategies-v3.ts` + `signal-generator.ts`, `signal-generator-v2.ts`
파일명 버전 관리는 LLM이 최신 버전을 판단하기 어려움.

#### 1-8. GitHub Issue Template 미구현

CLAUDE.md에 상세 정의했으나 `.github/ISSUE_TEMPLATE/` 미존재.

### MEDIUM

#### 1-9. Prettier 미설정

LLM마다 다른 포맷팅 스타일 생성 가능.

#### 1-10. CLAUDE.md 과도한 오버헤드

350줄+. 매 턴 헬스체크 블록 요구는 토큰 낭비.

#### 1-11. 테스트 커버리지 임계값 낮음

자동매매 시스템에 `statements: 60%, branches: 50%`는 부족.

---

## 2. 개선점 추천

### Priority 1: 즉시

| 항목 | 조치 |
|------|------|
| 레거시 디렉토리 삭제 | `src/sidepanel/`, `src/content/`, `src/database/` 삭제 |
| ESLint 설정 추가 | `eslint.config.js` (flat config) + `@typescript-eslint` |
| `.gitignore` 강화 | `data/`, `*.db*`, `forward-test-results*.json`, `playwright-report/`, `test-results/` |
| CI 워크플로우 | `.github/workflows/ci.yml` (test, lint, type-check, build) |

### Priority 2: 단기

| 항목 | 조치 |
|------|------|
| 버전 동기화 | manifest.json → 0.2.0 또는 빌드 스크립트 자동화 |
| web_accessible_resources 제한 | `<all_urls>` → Pocket Option 도메인 |
| 전략 파일 정리 | 디렉토리 기반 분리 + index.ts에서 최신 export |
| Issue Template | `.github/ISSUE_TEMPLATE/{bug,feature,refactor}.yml` |

### Priority 3: 중장기

| 항목 | 조치 |
|------|------|
| CLAUDE.md 경량화 | 핵심 100줄 + 상세는 docs/로 분리 |
| Prettier 도입 | `.prettierrc` + `eslint-config-prettier` |
| 커버리지 상향 | 거래 실행 경로 80%+ 목표 |
| CODEOWNERS | executor, trading 모듈 리뷰 강제 |
