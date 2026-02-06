# Pocket Option Auto Trading Extension

LLM이 바이브코딩으로 효과적으로 개발할 수 있도록 작성된 가이드라인입니다.

---

## 프로젝트 개요

**목적**: Pocket Option 바이너리 옵션 플랫폼에서 자동 매매를 수행하는 Chrome Extension

**기술 스택**:
- Chrome Extension (Manifest V3)
- React + Tailwind CSS (Side Panel UI)
- Dexie.js (IndexedDB 래퍼)
- TypeScript
- Vitest (테스트 프레임워크)

**핵심 기능**:
- 실시간 가격 데이터 수집 (DOM 파싱)
- 기술적 지표 계산 (RSI, SMA, EMA, MACD, Stochastic 등)
- 자동 매매 실행 (CALL/PUT)
- 전략 백테스팅
- 거래 로그 및 통계

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Side Panel │◄──►│  Background │◄──►│   Content   │  │
│  │  (React UI) │    │   (Worker)  │    │   Script    │  │
│  └─────────────┘    └──────┬──────┘    └─────────────┘  │
│                            │                             │
│                            ▼                             │
│                     ┌─────────────┐                      │
│                     │  IndexedDB  │                      │
│                     │  (Dexie.js) │                      │
│                     └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

**모듈별 역할**:
- `src/background/`: 중앙 상태 관리, 메시지 라우팅, DB 저장
- `src/content-script/`: DOM에서 가격 추출, 거래 실행
- `src/side-panel/`: 사용자 인터페이스 (상태 표시, 제어)
- `src/lib/`: 공유 라이브러리 (DB, 지표, 백테스트, 타입)

**데이터 흐름**:
1. Content Script가 DOM에서 가격 캡처 (MutationObserver)
2. `chrome.runtime.sendMessage`로 Background에 Tick 전송
3. Background가 IndexedDB에 저장
4. Side Panel이 상태 조회 및 표시

**메시지 통신 패턴**:
- Content Script ↔ Background: `chrome.runtime.sendMessage`
- Background → Content Script: `chrome.tabs.sendMessage`
- Side Panel ↔ Background: `chrome.runtime.sendMessage`

---

## 모듈 상세

| 모듈 | 진입점 | 핵심 책임 |
|------|--------|-----------|
| background | `src/background/index.ts` | 메시지 핸들러, 상태 관리, 알람 |
| content-script | `src/content-script/index.ts` | 데이터 수집, 거래 실행 |
| side-panel | `src/side-panel/App.tsx` | UI 렌더링, 사용자 입력 |
| lib/db | `src/lib/db/index.ts` | IndexedDB CRUD (Tick, Trade, Session, Strategy) |
| lib/indicators | `src/lib/indicators/index.ts` | 기술적 지표 계산 (SMA, EMA, RSI, MACD 등) |
| lib/backtest | `src/lib/backtest/engine.ts` | 백테스트 실행 엔진 |
| lib/types | `src/lib/types/index.ts` | TypeScript 타입 정의, DOM 셀렉터 |

**주요 파일별 기능**:
- `content-script/data-collector.ts`: MutationObserver로 가격 변화 감지, Tick 생성
- `content-script/executor.ts`: CALL/PUT 버튼 클릭, 거래 실행
- `content-script/payout-monitor.ts`: 페이아웃 비율 모니터링
- `lib/backtest/strategies/`: 전략 구현체 (RSI, SMMA+Stochastic)
- `lib/backtest/optimizer.ts`: 파라미터 최적화
- `lib/backtest/statistics.ts`: 백테스트 통계 계산

---

## 안전 규칙 (필수)

**데모 모드 3중 체크**: 실제 돈 거래 방지를 위해 반드시 준수

```typescript
// src/lib/types/index.ts의 isDemoMode() 함수 사용
// 3가지 조건을 모두 확인:
// 1. URL에 'demo' 파라미터 포함
// 2. Chart 요소에 'demo' 클래스 존재
// 3. 잔액 라벨에 'Demo' 텍스트 포함

// 거래 실행 전 반드시 체크
if (!isDemoMode(selectors)) {
  throw new Error('Demo mode required - 실제 거래 방지');
}
```

**안전 체크 포인트**:
- `executor.ts`의 모든 거래 함수 시작부
- Background에서 거래 명령 전달 전
- 새로운 거래 기능 추가 시 필수 포함

---

## 개발 규칙

**파일 네이밍**:
- 소스 파일: `kebab-case.ts` (예: `data-collector.ts`)
- 테스트 파일: `*.test.ts` 또는 `*.test.tsx` (소스와 같은 디렉토리)
- React 컴포넌트: `PascalCase.tsx` (예: `StatusCard.tsx`)

**테스트 규칙**:
- 모든 신규 기능에 테스트 필수
- 테스트 실행: `npm test`
- 커버리지 확인: `npm run test:coverage`

**코드 스타일**:
- TypeScript strict 모드 사용
- async/await 패턴 선호
- 에러는 명시적으로 처리 (silent fail 금지)

---

## 필수 워크플로우 (반드시 준수)

이 프로젝트는 **Jira 이슈 주도 개발**과 **3-file-pattern 문서화**를 필수로 따릅니다.

### 1. Jira 이슈 주도 개발

모든 개발 작업은 Jira 이슈를 기반으로 진행합니다.

**Jira 프로젝트 정보**:
- URL: https://auto-trade-extension.atlassian.net/jira/software/projects/PO/boards/2
- 프로젝트 키: `PO` (PO-CHROME)

**개발 단계별 Jira 관리**:

| 단계 | Jira 작업 | CLI 명령어 |
|------|-----------|------------|
| 시작 전 | 이슈 생성 또는 기존 이슈 확인 | `node scripts/jira-cli.cjs create --summary="작업 내용"` |
| 시작 | 상태를 "In Progress"로 변경 | `node scripts/jira-cli.cjs update SCRUM-XX --status="In Progress"` |
| 진행 중 | 진행 상황 댓글로 기록 | `node scripts/jira-cli.cjs comment SCRUM-XX --body="진행 내용"` |
| 완료 | 상태를 "Done"으로 변경 | `node scripts/jira-cli.cjs update SCRUM-XX --status="Done"` |

**Git 브랜치 네이밍 규칙**:
```bash
# 형식: jira/<이슈키>
git checkout -b jira/PO-123

# 예시
git checkout -b jira/PO-10   # 실시간 가격 데이터 수집
git checkout -b jira/PO-11   # 인디케이터 값 읽기
```

**커밋 메시지 규칙**:
```bash
# Conventional Commits + 이슈 키
git commit -m "feat(panel): add performance dashboard

SCRUM-17"
```

### 2. 3-file-pattern 문서화

모든 작업은 해당 폴더에 3개 파일로 문서화합니다.

| 파일 | 목적 | 업데이트 시점 |
|------|------|---------------|
| `task_plan.md` | 체크리스트 | 작업 항목 완료 시 체크 |
| `findings.md` | 결정/제약/핵심 정보 | 중요 발견 즉시 기록 |
| `progress.md` | 진행 로그 (최신이 위) | 매 작업 세션마다 |

**워크플로우 예시**:
```bash
# 1. Jira 이슈 확인/생성
node scripts/jira-cli.cjs get PO-10

# 2. 브랜치 생성
git checkout -b jira/PO-10

# 3. 상태 변경
node scripts/jira-cli.cjs update PO-10 --status="In Progress"

# 4. 작업 수행 + 3-file 문서화
# - docs/features/xxx/task_plan.md 체크박스 업데이트
# - docs/features/xxx/findings.md에 발견사항 기록
# - docs/features/xxx/progress.md에 진행 로그 추가

# 5. 커밋
git add .
git commit -m "feat(xxx): implement feature

PO-10"

# 6. 완료 처리
node scripts/jira-cli.cjs update PO-10 --status="Done"
```

**Jira CLI 도움말**:
```bash
node scripts/jira-cli.cjs help
```

---

## 빠른 시작 가이드

**자주 하는 작업별 진입점**:

| 작업 | 파일 경로 |
|------|-----------|
| 새 기술적 지표 추가 | `src/lib/indicators/index.ts` |
| 새 전략 추가 | `src/lib/backtest/strategies/` (새 파일 생성) |
| UI 컴포넌트 수정 | `src/side-panel/components/` |
| DOM 셀렉터 수정 | `src/lib/types/index.ts` (DOMSelectors 인터페이스) |
| DB 스키마 수정 | `src/lib/db/index.ts` |
| 메시지 타입 추가 | `src/lib/types/index.ts` |
| 백테스트 로직 수정 | `src/lib/backtest/engine.ts` |

**개발 명령어**:
```bash
npm run dev        # 개발 서버 시작
npm run build      # 프로덕션 빌드
npm test           # 테스트 실행
npm run lint       # 린트 체크
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| Content Script 동작 안함 | 탭에 스크립트 미주입 | 탭 새로고침 (F5) |
| 메시지 전달 실패 | Service Worker 비활성화 | `chrome://extensions`에서 워커 재시작 |
| DB 데이터 확인 필요 | - | DevTools → Application → IndexedDB |
| 가격 캡처 안됨 | DOM 셀렉터 변경됨 | `DOMSelectors` 업데이트 필요 |
| 거래 실행 안됨 | 데모 모드 체크 실패 | 데모 계정으로 로그인 확인 |

---

## 이슈 관리 규칙

### 원칙
**모든 작업은 이슈 티켓을 먼저 생성한 후 커밋합니다.**

이슈 없이 커밋할 수 있는 예외:
- 긴급 핫픽스 (서비스 장애 대응)
- 의존성 보안 패치
- 오타 수정 (1-2줄)

위 경우에도 `[-]`로 표기하고, 가능하면 사후에 이슈를 생성하세요.

### 이슈 생성 체크리스트

LLM 에이전트가 작업을 시작하기 전 확인:

1. **현재 작업에 이슈가 있는가?**
   - Jira 또는 GitHub Issues 검색
   - 이슈 번호 형식: `PO-17`, `ISSUE-23` 등

2. **없다면 이슈를 생성**
   - 제목: 한국어로 작업 내용 요약 (예: "WebSocket 파서 null 체크 추가")
   - 본문: 아래 템플릿 사용

3. **이슈 번호를 커밋/PR에 연결**
   - 커밋: `[PO-17][모듈명] 제목`
   - PR: `Closes #PO-17`

### 이슈 템플릿

#### 버그 수정 이슈
```markdown
## 증상
- 어떤 문제가 발생하는가?
- 재현 조건

## 원인 (파악된 경우)
- 기술적 원인

## 해결 방안
- 계획된 수정 방법

## 우선순위
- [ ] 긴급 (서비스 장애)
- [ ] 높음 (기능 장애)
- [ ] 보통 (불편)
- [ ] 낮음 (개선)
```

#### 신규 기능 이슈
```markdown
## 목표
- 무엇을 만들 것인가?

## 요구사항
- 기능 명세
- UI/UX 요구사항

## 기술 스택
- 사용할 라이브러리/프레임워크

## 완료 조건
- [ ] 조건 1
- [ ] 조건 2
```

#### 리팩토링 이슈
```markdown
## 현재 문제
- 왜 리팩토링이 필요한가?

## 개선 목표
- 어떻게 개선할 것인가?

## 영향 범위
- 변경될 모듈/파일

## 롤백 계획
- 문제 발생 시 대응 방안
```

### LLM 에이전트 워크플로우
```
1. 작업 지시 받음
   ↓
2. 관련 이슈 검색
   ↓
3-A. 이슈 있음 → 이슈 번호 사용
3-B. 이슈 없음 → 이슈 생성 (위 템플릿 사용)
   ↓
4. 이슈 번호로 브랜치 생성
   예: jira/PO-17, claude/backtest-leaderboard
   ↓
5. 커밋 (이슈 번호 포함)
   예: [PO-17][backtest] 리더보드 추가
   ↓
6. PR 생성 (이슈 번호 연결)
   예: Closes #PO-17
```

### 이슈 생성 예외 케이스

**Q: 작은 오타 수정도 이슈를 만들어야 하나요?**
A: 1-2줄 오타는 `[-][docs] README 오타 수정` 형식으로 커밋 가능. 하지만 문서 전체 개편은 이슈 생성 권장.

**Q: 긴급 핫픽스는?**
A: 먼저 `[-][urgent] 긴급 수정` 형식으로 커밋 후, 배포 완료 뒤 이슈 생성하여 사후 문서화.

**Q: 여러 이슈를 한 PR에 묶어도 되나요?**
A: 안 됩니다. 1 PR = 1 이슈 원칙. 관련 이슈가 여러 개면 상위 Epic 이슈를 만들고, 하위 이슈로 분리.

### 커밋 & PR 컨벤션 참고

상세 규칙은 아래 파일 참고:
- 커밋 메시지: `.github/COMMIT_CONVENTION.md`
- PR 템플릿: `.github/PULL_REQUEST_TEMPLATE.md`

---

# 문서화 운영 규칙

이 섹션은 프로젝트 문서화의 기본 규칙을 요약합니다.

## 기본 구조

- `docs/head/plan.md`: 헤드 인덱스(요약 + 링크)
- `docs/head/task_plan.md`: 상위 체크리스트
- `docs/head/findings.md`: 핵심 발견사항/결정/제약
- `docs/head/progress.md`: 진행 로그(역순)
- `docs/head/map.md`: 아키텍처 ↔ 기능 매핑
- `docs/head/parallel-work.md`: 병렬 작업 분류 및 상태

## 3-file 규칙

모든 작업 폴더는 아래 3개 파일을 반드시 포함합니다.

- `task_plan.md`: 체크리스트(항목은 진행 시 체크)
- `findings.md`: 결정 사항, 제약/가정, 핵심 정보, 코드 스니펫
- `progress.md`: 날짜별 진행 로그(최신이 위)

## 폴더 체계

- 아키텍처: `docs/architecture/`
  - `content-script/`
  - `background-service-worker/`
  - `side-panel-ui/`
  - `local-database/`
- 기능: `docs/features/`
  - `data-collector/`
  - `navigator/`
  - `executor/`
  - `technical-analyst/`
  - `backtester-logger/`

각 하위 폴더도 3-file 규칙을 적용합니다.

## 병렬 작업 상태 규칙

`docs/head/parallel-work.md`의 체크박스 상태는 다음과 같이 사용합니다.

- `- [ ]` 시작 전
- `- [~]` 진행 중
- `- [x]` 완료

## 작성 원칙

- 중복 기록 금지, 나중에 재참조 가치가 높은 정보 위주
- 변경 시 즉시 문서 반영(요약은 `head`, 상세는 해당 폴더)

## 헬스체크 로깅 (필수)

**모든 응답 마지막에 헬스체크 블록을 포함하라.**

```text
--- healthcheck ---
context_used:
  task_plan_tokens: ~줄 수 또는 토큰 수
  findings_tokens: ~줄 수 또는 토큰 수
  progress_tokens: ~줄 수 또는 토큰 수
  extra_context: 외부 문서/툴 결과 요약
actions:
  - type: update_task_plan | update_findings | update_progress | no_update
    details: 한 줄 설명
ab_test_variant: default
notes: 컨텍스트 품질/문제점
--- end_healthcheck ---
```

## 토큰 최적화 피드백 루프

헬스체크를 통해 토큰 사용량을 추적하고, 다음 원칙으로 컴팩트한 컨텍스트 사용을 추구하라:

1. **측정**: 매 턴 `context_used`에 참조한 파일별 대략적인 토큰/줄 수를 기록
2. **평가**: 사용한 컨텍스트 중 실제로 응답에 기여한 비율을 `notes`에 평가
3. **개선**: 불필요하게 많이 읽은 경우, 다음 턴에서 더 선택적으로 읽기
4. **기록**: 효과적이었던 컨텍스트 전략은 `findings.md`에 남겨 재사용

### 컴팩트 컨텍스트 원칙

- 전체 파일을 읽기 전에 "이 파일의 어느 부분이 필요한가?" 먼저 판단
- `task_plan.md`는 체크박스 상태 파악용으로 스캔, 전문 숙독은 필요시에만
- `findings.md`는 현재 질문과 관련된 섹션만 선택적으로 참조
- `progress.md`는 최근 항목 위주로 읽고, 과거 기록은 필요시에만 탐색
- 도구 호출 결과는 그대로 쓰지 말고, 목표에 연결된 요약으로 변환

### 피드백 루프 사이클

```
[컨텍스트 읽기] → [응답 생성] → [헬스체크 기록] → [효율성 평가] → [다음 턴 전략 조정]
```

이 사이클을 반복하며 점진적으로 더 적은 토큰으로 더 정확한 응답을 생성하는 방향으로 발전하라.
