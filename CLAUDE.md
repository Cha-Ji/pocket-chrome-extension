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
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │  Side Panel │◄──►│  Background │◄──►│   Content   │          │
│  │  (React UI) │    │   (Worker)  │    │   Script    │          │
│  └─────────────┘    └──────┬──────┘    └──────▲──────┘          │
│                            │                  │ window.postMessage│
│                            ▼                  │  (pq-bridge)     │
│                     ┌─────────────┐    ┌──────┴──────┐          │
│                     │  IndexedDB  │    │ Tampermonkey │          │
│                     │  (Dexie.js) │    │  WS Hook     │          │
│                     └─────────────┘    │ (Main World) │          │
│                                        └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

**모듈별 역할**:
- `src/background/`: 중앙 상태 관리, 메시지 라우팅, DB 저장
- `src/content-script/`: DOM에서 가격 추출, 거래 실행, WebSocket 데이터 수신
- `src/side-panel/`: 사용자 인터페이스 (상태 표시, 제어)
- `src/lib/`: 공유 라이브러리 (DB, 지표, 백테스트, 타입)
- `scripts/tampermonkey/`: Tampermonkey 유저스크립트 (WebSocket 후킹) - **프로젝트 외부에서 실행**
- `scripts/manual-injection/`: 수동 콘솔 주입용 WebSocket 후킹 스크립트 (Tampermonkey 대안)

**데이터 흐름** (2가지 경로):

경로 A — DOM 파싱:
1. Content Script의 DataCollector가 MutationObserver로 가격 변화 감지
2. `chrome.runtime.sendMessage`로 Background에 Tick 전송
3. Background가 IndexedDB에 저장

경로 B — WebSocket 인터셉트 (주력):
1. Tampermonkey 스크립트가 Main World에서 WebSocket 생성자를 오버라이드하여 모든 WS 메시지를 가로챔
2. `window.postMessage(source: 'pq-bridge')`로 Content Script에 전달
3. WebSocketInterceptor가 수신 → WebSocketParser가 파싱
4. 캔들 히스토리/가격 업데이트를 콜백으로 분배
5. AutoMiner가 자산별 히스토리를 DataSender로 로컬 서버에 전송

**신호 → 거래 흐름**:
1. SignalGeneratorV2가 캔들 버퍼에서 시장 레짐 감지 (ADX 기반)
2. 레짐별 최적 전략으로 CALL/PUT 신호 생성
3. AutoTrader가 리스크 체크 (일일 한도, 드로다운, 연속손실) 통과 시 실행
4. TradeExecutor가 데모 모드 확인 후 DOM 클릭 시뮬레이션

**메시지 통신 패턴**:
- Tampermonkey → Content Script: `window.postMessage` (`source: 'pq-bridge'`)
- Content Script → Tampermonkey: `window.postMessage` (`source: 'pq-content'`)
- Content Script ↔ Background: `chrome.runtime.sendMessage`
- Background → Content Script: `chrome.tabs.sendMessage`
- Side Panel ↔ Background: `chrome.runtime.sendMessage`

---

## 모듈 상세

### 핵심 모듈 (manifest.json 진입점)

| 모듈 | 진입점 | 핵심 책임 |
|------|--------|-----------|
| background | `src/background/index.ts` | 중앙 메시지 라우터, 거래 상태 관리, Tick 저장, 에러→텔레그램 알림, 주기적 데이터 정리(알람) |
| content-script | `src/content-script/index.ts` | DOM 가격 추출, WebSocket 인터셉트, 거래 실행, 신호 생성, 자동 채굴 |
| side-panel | `src/side-panel/App.tsx` | 탭 기반 UI (신호, 자동매매, 상태, 로그, 리더보드, 설정) |

### 플랫폼 추상화 레이어 (`src/lib/platform/`)

| 모듈 | 진입점 | 핵심 책임 |
|------|--------|-----------|
| platform/interfaces | `src/lib/platform/interfaces.ts` | IDataSource, IExecutor, ISafetyGuard, IPlatformAdapter 인터페이스 정의 |
| platform/registry | `src/lib/platform/registry.ts` | 플랫폼 자동 감지 + 어댑터 관리 (싱글톤) |
| platform/pocket-option | `src/lib/platform/adapters/pocket-option/` | PO Demo 어댑터 (셀렉터, 실행기, 안전장치, 데이터소스) |

### 공유 라이브러리 (`src/lib/`)

| 모듈 | 진입점 | 핵심 책임 |
|------|--------|-----------|
| lib/db | `src/lib/db/index.ts` | IndexedDB CRUD — ticks, trades, sessions, strategies, candles, leaderboard (Dexie v3 스키마) |
| lib/types | `src/lib/types/index.ts` | TypeScript 타입, DOM 셀렉터, `isDemoMode()` 안전 함수, `getAccountType()` |
| lib/indicators | `src/lib/indicators/index.ts` | 기술적 지표 계산 (SMA, EMA, RSI, MACD, Stochastic, Bollinger, ATR, Williams %R, CCI) |
| lib/backtest | `src/lib/backtest/engine.ts` | 백테스트 엔진, 10+ 전략 구현체, 파라미터 최적화, 리더보드, 통계 리포트 |
| lib/signals | `src/lib/signals/signal-generator.ts` | 실시간 신호 생성 시스템 — 시장 레짐(ADX) 감지 → 레짐별 최적 전략 선택 → CALL/PUT 신호 |
| lib/signals (v2) | `src/lib/signals/signal-generator-v2.ts` | 고승률 최적화 신호 생성기 — 투표 전략, RSI+BB 바운스, 추세 필터링, 신뢰도 기반 필터 |
| lib/trading | `src/lib/trading/auto-trader.ts` | 자동매매 실행 루프 — 포지션 사이징(고정/%), 리스크 관리(일일 한도, 드로다운, 연속손실), 쿨다운 |
| lib/errors | `src/lib/errors/index.ts` | POError 커스텀 에러 체계, ErrorCode enum, Result<T> 타입, 중앙 에러 핸들러, retry/timeout 유틸 |
| lib/notifications | `src/lib/notifications/telegram.ts` | 텔레그램 Bot API 연동 — 신호/거래/에러/상태 알림 전송 |
| lib/strategy-rag | `src/lib/strategy-rag/index.ts` | 전략 지식 저장소 — YouTube 트랜스크립트/문서에서 전략 조건 추출, 키워드 검색 |
| lib/logger | `src/lib/logger/index.ts` | 모듈별 컬러 로깅 시스템 — 로그 레벨 제어, 모듈 필터링, `window.pqLog` 개발 도구 |
| lib/dom-utils | `src/lib/dom-utils.ts` | DOM 헬퍼 — `forceClick()` (React 이벤트 우회 클릭) |
| lib/data-sender | `src/lib/data-sender.ts` | 수집 캔들을 로컬 서버(`localhost:3001`)로 HTTP POST 전송 (실시간/벌크) |
| lib/diagnostics | `src/lib/diagnostics.ts` | DOM 요소 진단 도구 — React 내부 프로퍼티 검사, 이벤트 리스너 모니터링 |
| lib/deep-analyzer | `src/lib/deep-analyzer.ts` | DOM 이벤트 심층 분석 스크립트 — 자산 목록 클릭 이벤트 캡처/버블 추적 |
| lib/verification | `src/lib/verification.ts` | Auto Miner 종합 검증 도구 — 셀렉터/React 핸들러/자산 전환 동작 검증 |

### Content Script 하위 모듈

| 파일 | 핵심 책임 |
|------|-----------|
| `content-script/data-collector.ts` | MutationObserver로 DOM 가격 변화 감지 → Tick 생성 → Background로 전송 |
| `content-script/executor.ts` | CALL/PUT 버튼 클릭 시뮬레이션, 데모 모드 3중 체크, 금액 설정 |
| `content-script/candle-collector.ts` | DOM에서 OHLCV 캔들 데이터 수집, 틱→캔들 변환, IndexedDB 저장 |
| `content-script/payout-monitor.ts` | 자산 목록 DOM 파싱, 페이아웃 비율 추적, 고페이아웃(≥92%) 자산 필터링, 자산 전환 |
| `content-script/indicator-reader.ts` | PO 페이지 DOM에서 RSI/Stochastic/MACD/BB 인디케이터 값 직접 읽기 |
| `content-script/websocket-interceptor.ts` | WebSocket 메시지 가로채기 — Tampermonkey 브릿지 경유, 가격/캔들 히스토리 콜백, 직접 메시지 전송 |
| `content-script/websocket-parser.ts` | WebSocket 메시지 파싱 — price_update/candle_data/candle_history/heartbeat 타입 분류 |
| `content-script/auto-miner.ts` | 자동 데이터 채굴 — 고페이아웃 자산 순회, WebSocket으로 히스토리 요청, 로컬 서버 전송 |
| `content-script/selector-resolver.ts` | 다단계 DOM 셀렉터 폴백 시스템 — primary → fallback 셀렉터 자동 시도, 결과 캐싱 |

---

## Tampermonkey WebSocket 후킹 (외부 스크립트)

> **중요**: 이 스크립트들은 프로젝트 빌드에 포함되지 않습니다. 사용자가 직접 Tampermonkey 확장에 등록하거나 브라우저 콘솔에 붙여넣어 사용합니다.

### 왜 Tampermonkey인가?

Chrome Extension의 Content Script는 **Isolated World**에서 실행되어 페이지의 `WebSocket` 객체에 직접 접근할 수 없습니다. Tampermonkey는 `@run-at document-start` + `unsafeWindow`를 통해 **Main World**에서 페이지 로드 전에 확실하게 WebSocket 생성자를 오버라이드할 수 있습니다.

### 스크립트 파일

| 파일 | 용도 | 사용법 |
|------|------|--------|
| `scripts/tampermonkey/inject-websocket.user.js` | Tampermonkey 유저스크립트 | Tampermonkey 대시보드에서 새 스크립트로 등록 |
| `scripts/manual-injection/hook.js` | 콘솔 수동 주입 | 브라우저 DevTools 콘솔(F12)에 붙여넣기 후 페이지 새로고침 |

### 동작 메커니즘

```
[Pocket Option 페이지 로드]
       │
       ▼
[Tampermonkey: document-start에서 WebSocket 생성자 오버라이드]
       │
       ▼ (사이트 코드가 new WebSocket() 호출)
[후킹된 WebSocket이 원본 WebSocket을 생성하고 메시지 리스너를 래핑]
       │
       ▼ (WS 메시지 수신 시)
[메시지 디코딩 (string/ArrayBuffer/Blob) → JSON 파싱 시도]
[Socket.IO Binary Placeholder 패턴 처리 (451-["event",{_placeholder:true}])]
       │
       ▼
[window.postMessage({ source: 'pq-bridge', type: 'ws-message', data: {...} })]
       │
       ▼
[Content Script의 websocket-interceptor.ts가 수신 → 파싱 → 콜백 분배]
```

### 양방향 Bridge 통신

- **수신 (Tampermonkey → Extension)**: `source: 'pq-bridge'`, `type: 'ws-message'` 또는 `'bridge-ready'`
- **송신 (Extension → Tampermonkey)**: `source: 'pq-content'`, `type: 'ws-send'` → Tampermonkey가 활성 WebSocket을 찾아 메시지 전송

### 관련 코드

- 수신 측: `src/content-script/websocket-interceptor.ts` (`handleBridgeMessage`)
- 리서치 문서: `docs/research/tampermonkey-integration/findings.md`

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

이 프로젝트는 **GitHub Issues 주도 개발**과 **3-file-pattern 문서화**를 필수로 따릅니다.

### 1. GitHub Issues 주도 개발

모든 개발 작업은 GitHub Issues를 기반으로 진행합니다.

**GitHub 프로젝트 정보**:
- Issues: https://github.com/yourusername/pocket-chrome-extension/issues
- Project: https://github.com/yourusername/pocket-chrome-extension/projects

**라벨링 규칙** (모든 이슈는 다음 라벨 중 1개 이상 사용):

| 라벨 | 설명 | 색상 | 사용 기준 |
|------|------|------|----------|
| `feat` | 신규 기능 | 🟢 `#00ff00` | 새로운 기능/UI 추가 |
| `bug` | 버그 수정 | 🔴 `#ff0000` | 기존 기능의 문제 수정 |
| `docs` | 문서 작성 | 🔵 `#0000ff` | README, CLAUDE.md, 코드 주석 등 |
| `refactor` | 코드 정리 | 🟡 `#ffaa00` | 기능 유지, 구조 개선 |
| `test` | 테스트 | 🟣 `#aa00ff` | 테스트 코드 추가/수정 |
| `chore` | 잡무 | ⚫ `#333333` | 패키지, 설정, CI/CD 변경 |
| `p0` | 긴급 | 🔴 `#ff0000` | 서비스 장애 (우선순위) |
| `p1` | 높음 | 🟠 `#ffaa00` | 기능 장애 (우선순위) |
| `p2` | 보통 | 🟡 `#ffff00` | 불편 (우선순위) |

**개발 단계별 GitHub 관리**:

| 단계 | 작업 |
|------|------|
| 시작 전 | 이슈 생성 또는 기존 이슈 확인 (`.github/ISSUE_TEMPLATE/` 참고) |
| 시작 | 이슈를 자신에게 할당 (Assign yourself) |
| 진행 중 | 이슈 상태를 "In Progress"로 변경 (Project 탭에서) |
| 진행 중 | 필요하면 댓글로 진행 상황 기록 |
| 완료 | PR 생성 후 `Closes #XXX` 로 연결 |

**Git 브랜치 네이밍 규칙**:
```bash
# 형식: <라벨>/<이슈번호>-<간단한설명>
git checkout -b feat/123-add-websocket-hook

# 예시
git checkout -b feat/10-real-time-price-collector
git checkout -b bug/15-fix-null-pointer
git checkout -b docs/20-update-readme
```

**커밋 메시지 규칙** (상세: `.github/COMMIT_CONVENTION.md`):
```bash
# [이슈번호][모듈] 한국어 제목 + LLM Context 본문
git commit -m "[#10][data-collector] 실시간 가격 수집 모듈 구현

* 구현 내용: MutationObserver 기반 DOM 가격 캡처
* 영향범위: content-script 모듈 (신규)
* LLM Context: Implemented real-time price capture using MutationObserver on Pocket Option DOM elements."
```

### 2. 3-file-pattern 문서화 (항상 적용 — Rule)

> 이 규칙은 모든 세션에서 자동 적용된다. `/3-file-pattern` skill 호출 불필요.
> 상세 템플릿과 Tier 시스템: `docs/DOCUMENTATION_RULES.md` 참조.

#### 세션 시작 프로토콜 (Session Handoff)

새 세션이 작업을 이어받을 때 **반드시** 다음 순서로 수행하라:

1. `docs/head/progress.md` 읽기 → 마지막 작업 상태 + "다음 행동" 확인
2. `docs/head/task_plan.md` 읽기 → 전체 진행률 파악
3. 현재 작업의 3-file 폴더 찾기 (`docs/issues/PO-XX/` 또는 `docs/features/XXX/`)
4. 해당 폴더의 `progress.md` → `task_plan.md` → 필요시 `findings.md` 순서로 읽기
5. 작업 재개 (`progress.md`의 "다음 행동"부터)

**문서 탐색 우선순위**:
```
docs/head/progress.md          ← 1순위: 마지막 상태
docs/head/task_plan.md         ← 2순위: 전체 체크리스트
docs/issues/PO-XX/progress.md  ← 3순위: 이슈별 상세
docs/features/XXX/progress.md  ← 3순위: 기능별 상세
docs/head/findings.md          ← 필요시: 핵심 결정사항
docs/head/map.md               ← 필요시: 아키텍처 매핑
```

#### 3-file 필수 규칙

| 규칙 | 설명 |
|------|------|
| 시작 전 읽기 | 작업 시작 전 해당 폴더의 `task_plan.md` + `progress.md` 필수 읽기 |
| 즉시 생성 | 3개 파일이 없으면 즉시 생성 (템플릿: `docs/DOCUMENTATION_RULES.md`) |
| 발견 즉시 기록 | 새 사실/제약/결정 → `findings.md`에 즉시 기록 |
| 완료 즉시 체크 | 하위 작업 완료 → `task_plan.md` 체크박스 갱신 |
| 세션 종료 기록 | 중단/종료 시 `progress.md` 최상단에 현재 상태 + "다음 행동" 기록 |
| 응답에 명시 | 응답 종료 시 업데이트한 파일명 명시 (헬스체크 블록에 포함) |

**2단계 Tier 시스템**:
- **Tier 1 (Full 3-File)**: 활성/완성 작업 → `task_plan.md` + `findings.md` + `progress.md`
- **Tier 2 (Single README)**: 미착수/참조용 → `README.md`만 (작업 시작 시 Tier 1로 승격)

#### 워크플로우 예시
```bash
# 1. GitHub Issue 확인/생성
gh issue view 10

# 2. 브랜치 생성
git checkout -b feat/10-real-time-price-collector

# 3. 작업 수행 + 3-file 문서화
# - docs/features/xxx/task_plan.md 체크박스 업데이트
# - docs/features/xxx/findings.md에 발견사항 기록
# - docs/features/xxx/progress.md에 진행 로그 추가

# 4. 커밋
git commit -m "[#10][data-collector] 실시간 가격 수집 구현"

# 5. PR 생성
gh pr create --title "[#10][data-collector] 실시간 가격 수집 구현" --body "Closes #10"
```

**GitHub CLI 유용한 명령어**:
```bash
# 이슈 목록 조회
gh issue list --label feat --state open

# 특정 이슈 상세 조회
gh issue view 10

# PR 생성
gh pr create --title "제목" --body "Closes #10"
```

---

## 빠른 시작 가이드

**자주 하는 작업별 진입점**:

| 작업 | 파일 경로 |
|------|-----------|
| 새 기술적 지표 추가 | `src/lib/indicators/index.ts` |
| 새 백테스트 전략 추가 | `src/lib/backtest/strategies/` (새 파일 생성) |
| 새 신호 전략 추가 | `src/lib/signals/strategies.ts` 또는 `strategies-v2.ts` |
| UI 컴포넌트 수정 | `src/side-panel/components/` |
| DOM 셀렉터 수정 | `src/lib/types/index.ts` + `content-script/selector-resolver.ts` |
| DB 스키마 수정 | `src/lib/db/index.ts` (version 번호 올려서 마이그레이션) |
| 메시지 타입 추가 | `src/lib/types/index.ts` (ExtensionMessage) |
| 백테스트 로직 수정 | `src/lib/backtest/engine.ts` |
| 리스크 관리 설정 변경 | `src/lib/trading/auto-trader.ts` (AutoTraderConfig) |
| 텔레그램 알림 수정 | `src/lib/notifications/telegram.ts` |
| 에러 코드 추가 | `src/lib/errors/error-codes.ts` |
| WebSocket 후킹 수정 | `scripts/tampermonkey/inject-websocket.user.js` |
| WebSocket 파싱 수정 | `content-script/websocket-parser.ts` |
| 자동 채굴 로직 수정 | `content-script/auto-miner.ts` |
| 전략 지식 추가 | `src/lib/strategy-rag/index.ts` |
| 플랫폼 어댑터 추가 | `src/lib/platform/adapters/` (새 폴더 생성) |

**개발 명령어**:
```bash
npm run dev        # 개발 서버 시작 (localhost 권한 포함)
npm run build      # 프로덕션 빌드 (최소 권한)
npm run build:dev  # 개발용 빌드 (localhost 권한 포함)
npm test           # 테스트 실행
npm run lint       # 린트 체크
```

> **상세 운영 가이드**: 서버 실행법, 테스트 실행법, 백테스트 실행/분석, 로그 해석 등은 [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)를 참조하세요.

### 개발/배포 환경 권한 분리

Chrome Extension의 `host_permissions`를 빌드 모드에 따라 분리합니다.

**프로덕션 빌드** (`npm run build`):
- `manifest.json`에 명시된 권한만 포함 (PO 도메인 + Telegram API)
- `DataSender` (localhost:3001 전송)는 no-op 처리
- `DBMonitorDashboard`의 서버 연결 섹션 비활성화

**개발 빌드** (`npm run dev` / `npm run build:dev`):
- `http://localhost:3001/*` 권한 자동 추가
- `DataSender`, `DBMonitorDashboard` 서버 연결 정상 동작
- 로컬 데이터 수집 서버 실행 필요: `npm run collector`

**권한 구성 파일**: `vite.config.ts`의 `DEV_HOST_PERMISSIONS` 배열에서 개발 전용 권한 관리.

**환경 변수**: Vite의 `import.meta.env.DEV`를 사용하여 런타임 dev/prod 분기. 빌드 타임에 정적 치환되어 프로덕션에서는 dead code elimination됨.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| Content Script 동작 안함 | 탭에 스크립트 미주입 | 탭 새로고침 (F5) |
| 메시지 전달 실패 | Service Worker 비활성화 | `chrome://extensions`에서 워커 재시작 |
| DB 데이터 확인 필요 | - | DevTools → Application → IndexedDB |
| 가격 캡처 안됨 | DOM 셀렉터 변경됨 | `DOMSelectors` 업데이트 필요 |
| 거래 실행 안됨 | 데모 모드 체크 실패 | 데모 계정으로 로그인 확인 |
| WebSocket 데이터 수신 안됨 | Tampermonkey 스크립트 미설치/비활성화 | Tampermonkey 대시보드에서 스크립트 활성화 확인 |
| WS 후킹 중복 실행 경고 | 스크립트가 이미 주입됨 | `__pocketQuantWsHook` 플래그로 자동 감지, 페이지 새로고침 |

---

## 이슈 관리 규칙

### 원칙
**모든 작업은 GitHub Issue를 먼저 생성한 후 커밋합니다.**

이슈 없이 커밋할 수 있는 예외:
- 긴급 핫픽스 (서비스 장애 대응)
- 의존성 보안 패치
- 오타 수정 (1-2줄)

위 경우에도 `[-]`로 표기하고, 가능하면 사후에 이슈를 생성하세요.

### 이슈 생성 체크리스트

LLM 에이전트가 작업을 시작하기 전 확인:

1. **현재 작업에 이슈가 있는가?**
   - GitHub Issues 검색: https://github.com/yourusername/pocket-chrome-extension/issues
   - 이슈 번호 형식: `#10`, `#123` 등

2. **없다면 이슈를 생성**
   - 제목: 한국어로 작업 내용 요약 (예: "WebSocket 파서 null 체크 추가")
   - 본문: 아래 템플릿 사용
   - 라벨 추가: `feat`, `bug`, `docs` 등 (위의 라벨링 규칙 참고)

3. **이슈 번호를 커밋/PR에 연결**
   - 커밋: `[#17][모듈명] 제목`
   - PR: `Closes #17`

### 이슈 템플릿

GitHub Issue 생성 시 `.github/ISSUE_TEMPLATE/`의 YAML 폼이 자동 적용됩니다:
- 버그 수정: `.github/ISSUE_TEMPLATE/bug.yml` (`bug` 라벨 자동 추가)
- 신규 기능: `.github/ISSUE_TEMPLATE/feature.yml` (`feat` 라벨 자동 추가)
- 리팩토링: `.github/ISSUE_TEMPLATE/refactor.yml` (`refactor` 라벨 자동 추가)

### LLM 에이전트 워크플로우
```
1. 작업 지시 받음
   ↓
2. 관련 이슈 검색
   ↓
3-A. 이슈 있음 → 이슈 번호 사용
3-B. 이슈 없음 → 이슈 생성 (.github/ISSUE_TEMPLATE/ 참고)
   ↓
4. 이슈 번호로 브랜치 생성
   예: feat/10-real-time-price, bug/15-fix-crash
   ↓
5. 커밋 (이슈 번호 포함)
   예: [#10][data-collector] 실시간 가격 수집
   ↓
6. PR 생성 (이슈 번호 연결)
   예: Closes #10
```

### 이슈 생성 예외 케이스

**Q: 작은 오타 수정도 이슈를 만들어야 하나요?**
A: 1-2줄 오타는 `[-][docs] README 오타 수정` 형식으로 커밋 가능. 하지만 문서 전체 개편은 이슈 생성 권장.

**Q: 긴급 핫픽스는?**
A: 먼저 `[-][urgent] 긴급 수정` 형식으로 커밋 후, 배포 완료 뒤 이슈 생성하여 사후 문서화. `p0` 라벨 추가.

**Q: 여러 이슈를 한 PR에 묶어도 되나요?**
A: 안 됩니다. 1 PR = 1 이슈 원칙. 관련 이슈가 여러 개면 상위 epic/tracking 이슈를 만들고, 하위 이슈로 분리.

### 커밋 & PR 컨벤션 참고

상세 규칙은 아래 파일 참고:
- 커밋 메시지: `.github/COMMIT_CONVENTION.md`
- PR 템플릿: `.github/PULL_REQUEST_TEMPLATE.md`
- GitHub Labels 설정: `.github/labels.json` (선택사항)

---

## Issue Queue (클라우드 LLM → 로컬 이슈 브릿지)

클라우드 LLM 환경에서는 GitHub API 접근이 불가하므로, `docs/issue-queue/`에 이슈를 마크다운으로 모아두고 로컬 LLM이 처리합니다.

**폴더 구조**:
```
docs/issue-queue/
├── README.md                    # 운영 가이드
├── _templates/                  # 템플릿 (삭제 금지)
│   ├── bug.md
│   ├── feature.md
│   └── refactor.md
└── p0-bug-example-slug.md       # ← 처리 대상 이슈 파일
```

**파일 네이밍**: `{priority}-{type}-{slug}.md`
- priority: `p0` (긴급) ~ `p3` (낮음)
- type: `bug`, `feature`, `refactor`
- slug: kebab-case 영문 요약

**Slash Commands**:

| 커맨드 | 환경 | 사용법 |
|--------|------|--------|
| `/queue-issue` | 클라우드 | `/queue-issue bug executor에서 금액 검증 누락` |
| `/process-issues` | 로컬 | `/process-issues` 또는 `/process-issues --dry-run` |

**클라우드 LLM 작업 시**:
1. `/queue-issue <type> <설명>` 실행 (권장)
2. 또는 수동으로: `_templates/`에서 복사 → frontmatter 작성 → 저장
3. 커밋 & 푸시

**로컬 LLM 처리 시**:
1. `/process-issues` 실행 (권장)
2. 또는 `scripts/process-issue-queue.sh` 실행
3. 파일 삭제 후 커밋 & 푸시

상세: `docs/issue-queue/README.md`

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

목적:
- 불필요한 파일 참조 감지 및 제거
- 현재 턴의 토큰 사용량 추적
- 이전 대화에서 누적된 컨텍스트 토큰 모니터링
- LLM의 작업 내용 간략히 기록

```text
╔════════════════════════════════════════════════════════════════╗
║                    🏥 HEALTHCHECK REPORT                       ║
╠════════════════════════════════════════════════════════════════╣
║ 📊 CONTEXT USAGE                                               ║
║ ─────────────────────────────────────────────────────────────  ║
║                                                                 ║
║  📁 Files Referenced (Current Turn):                           ║
║    ✓ docs/features/xxx/task_plan.md      ~150 tokens (30줄)   ║
║    ✓ docs/features/xxx/findings.md       ~200 tokens (40줄)   ║
║    ✓ docs/features/xxx/progress.md       ~100 tokens (20줄)   ║
║    ✓ src/content-script/executor.ts      ~300 tokens (읽기)   ║
║    ⚠ src/lib/types/index.ts              ~250 tokens (50% 사용)║
║    ✗ docs/architecture/xxx/overview.md   ~150 tokens (미사용) ║
║                                                                 ║
║  🔧 Tool Outputs:                                              ║
║    • Grep 결과: ~200 tokens                                    ║
║    • Git diff: ~300 tokens                                     ║
║    • 기타: ~100 tokens                                         ║
║                                                                 ║
║  📈 Totals:                                                    ║
║    • Current Turn Total: ~1,650 tokens                         ║
║    • Accumulated Turns: 3                                      ║
║    • Conversation History: ~5,000 tokens                       ║
║    • Grand Total: ~6,650 tokens                                ║
║                                                                 ║
║  ⚡ Efficiency Metrics:                                        ║
║    • Files Referenced: 6                                       ║
║    • Files Actually Used: 4 (✓) + 1 (⚠️) = 5                   ║
║    • Files Wasted: 1 (✗)                                       ║
║    • Waste Ratio: 16.7%  [🟢 Good]                            ║
║    • Contribution Rate: 83.3%                                  ║
║                                                                 ║
╠════════════════════════════════════════════════════════════════╣
║ 🎯 ACTIONS TAKEN                                               ║
║ ─────────────────────────────────────────────────────────────  ║
║                                                                 ║
║  ✏️  [UPDATE] docs/features/xxx/task_plan.md                   ║
║      → 체크박스 2개 완료 표시                                  ║
║                                                                 ║
║  📝 [UPDATE] docs/features/xxx/findings.md                     ║
║      → WebSocket 파서 null 체크 패턴 추가                      ║
║                                                                 ║
║  ⏭️  [SKIP] docs/features/xxx/progress.md                      ║
║      → 중간 단계, 로그 불필요                                  ║
║                                                                 ║
║  💾 [COMMIT] src/content-script/executor.ts                    ║
║      → 코드 수정 완료 및 커밋                                  ║
║                                                                 ║
║  🚀 [PUSH] claude/feature-branch                               ║
║      → 원격 브랜치에 푸시 완료                                 ║
║                                                                 ║
╠════════════════════════════════════════════════════════════════╣
║ 💡 NOTES & FEEDBACK                                            ║
║ ─────────────────────────────────────────────────────────────  ║
║                                                                 ║
║  ✅ Quality:                                                   ║
║     참조한 findings 중 80%가 실제 응답에 기여                  ║
║     task_plan의 체크박스 상태가 정확히 작업 진행 반영          ║
║                                                                 ║
║  ⚠️  Issues Detected:                                          ║
║     • overview.md를 읽었지만 실제로 사용하지 않음              ║
║     • progress.md의 오래된 로그(20줄 이상)는 불필요            ║
║     • types/index.ts를 전체 읽었지만 일부만 사용               ║
║                                                                 ║
║  🎯 Next Turn Strategy:                                        ║
║     • task_plan만 먼저 스캔, 필요한 체크박스만 확인            ║
║     • findings는 Grep으로 섹션 검색 후 선택적 읽기             ║
║     • progress는 최근 5개 항목만 읽기 (offset 사용)            ║
║     • overview.md는 명시적 요청 시에만 읽기                    ║
║                                                                 ║
║  🧪 AB Test Variant: default                                   ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
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
