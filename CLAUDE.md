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
│                     │  IndexedDB  │    │  WS Hook     │          │
│                     │  (Dexie.js) │    │ (Main World) │          │
│                     └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

**모듈별 역할**:
- `src/background/`: 중앙 상태 관리, 메시지 라우팅, DB 저장
- `src/content-script/`: DOM에서 가격 추출, 거래 실행, WebSocket 데이터 수신
- `src/side-panel/`: 사용자 인터페이스 (상태 표시, 제어)
- `src/lib/`: 공유 라이브러리 (DB, 지표, 백테스트, 타입)
- `scripts/tampermonkey/`: (레거시) 이전 Tampermonkey 유저스크립트 — 현재 미사용
- `scripts/manual-injection/`: (레거시) 수동 콘솔 주입 스크립트 — 현재 미사용

**데이터 흐름** (2가지 경로):

경로 A — DOM 파싱:
1. Content Script의 DataCollector가 MutationObserver로 가격 변화 감지
2. `chrome.runtime.sendMessage`로 Background에 Tick 전송
3. Background가 IndexedDB에 저장

경로 B — WebSocket 인터셉트 (주력):
1. `inject-websocket.js`가 Main World(`world: "MAIN"`)에서 WebSocket 생성자를 오버라이드하여 모든 WS 메시지를 가로챔
2. `window.postMessage(source: 'pq-bridge')`로 Content Script(Isolated World)에 전달
3. WebSocketInterceptor가 수신 → WebSocketParser가 파싱
4. 캔들 히스토리/가격 업데이트를 콜백으로 분배
5. AutoMiner가 자산별 히스토리를 DataSender로 로컬 서버에 전송

**신호 → 거래 흐름**:
1. SignalGeneratorV2가 캔들 버퍼에서 시장 레짐 감지 (ADX 기반)
2. 레짐별 최적 전략으로 CALL/PUT 신호 생성
3. AutoTrader가 리스크 체크 (일일 한도, 드로다운, 연속손실) 통과 시 실행
4. TradeExecutor가 데모 모드 확인 후 DOM 클릭 시뮬레이션

**메시지 통신 패턴**:
- WS Hook (Main World) → Content Script: `window.postMessage` (`source: 'pq-bridge'`)
- Content Script → WS Hook (Main World): `window.postMessage` (`source: 'pq-content'`)
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
| `content-script/websocket-interceptor.ts` | WebSocket 메시지 가로채기 — Main World 브릿지(`pq-bridge`) 경유, 가격/캔들 히스토리 콜백, 직접 메시지 전송 |
| `content-script/websocket-parser.ts` | WebSocket 메시지 파싱 — price_update/candle_data/candle_history/heartbeat 타입 분류 |
| `content-script/auto-miner.ts` | 자동 데이터 채굴 — 고페이아웃 자산 순회, WebSocket으로 히스토리 요청, 로컬 서버 전송 |
| `content-script/selector-resolver.ts` | 다단계 DOM 셀렉터 폴백 시스템 — primary → fallback 셀렉터 자동 시도, 결과 캐싱 |

---

## WebSocket 후킹 (Extension 내장)

Manifest V3의 `"world": "MAIN"` content script 설정으로 Extension이 직접 Main World에서 WebSocket을 후킹합니다. 외부 도구(Tampermonkey 등) 불필요.

### 스크립트 파일

| 파일 | 역할 |
|------|------|
| `src/content-script/inject-websocket.js` | WS 생성자 오버라이드 (Main World, `document_start`) |
| `src/content-script/websocket-interceptor.ts` | Bridge 메시지 수신 + 콜백 분배 (Isolated World) |
| `src/content-script/websocket-parser.ts` | 원시 메시지 파싱 |

### 동작 메커니즘

```
[Pocket Option 페이지 로드]
       │
       ▼
[inject-websocket.js: document_start에서 WebSocket 생성자 오버라이드 (Main World)]
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
[Content Script(Isolated World)의 websocket-interceptor.ts가 수신 → 파싱 → 콜백 분배]
```

### 양방향 Bridge 통신

- **수신 (Main World → Isolated World)**: `source: 'pq-bridge'`, `type: 'ws-message'` 또는 `'bridge-ready'`
- **송신 (Isolated World → Main World)**: `source: 'pq-content'`, `type: 'ws-send'` → Main World hook이 활성 WebSocket을 찾아 메시지 전송

### 관련 코드

- 수신 측: `src/content-script/websocket-interceptor.ts` (`handleBridgeMessage`)
- manifest 설정: `manifest.json` → `content_scripts[0]` (`"world": "MAIN"`)

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

## 거래 이벤트 흐름 (Trade Event Flow)

**TRADE_LOGGED / TRADE_SETTLED 처리 원칙**:

```
Content Script → TRADE_EXECUTED → Background → DB create → TRADE_LOGGED broadcast
Content Script → (setTimeout) → FINALIZE_TRADE → Background → DB finalize → TRADE_SETTLED broadcast
```

- Side Panel의 `useTrades` 훅은 **리페치 금지** — 이벤트(TRADE_LOGGED, TRADE_SETTLED)만으로 상태를 갱신한다.
- 내부적으로 `Map<tradeId, Trade>`를 유지하여 O(1) upsert. 중복 메시지에도 안전(idempotent).
- TRADE_SETTLED가 TRADE_LOGGED보다 먼저 도착해도 stub을 만들어 나중에 merge.

**Idempotent Finalize 원칙**:
- `TradeRepository.finalize()`는 `trade.result !== 'PENDING'`이면 아무것도 하지 않고 `{updated: false}`를 반환.
- 같은 tradeId로 여러 번 FINALIZE_TRADE가 호출돼도 세션 통계(wins/losses/totalTrades)가 중복 증가하지 않는다.
- `updated === false`이면 Background는 TRADE_SETTLED broadcast를 보내지 않는다.

**Binary Option PnL 계산 정의**:
- **WIN**: `+amount * (payoutPercent / 100)` — payoutPercent는 진입 시점의 현재 자산 payout
- **LOSS**: `-amount`
- **TIE**: `0`
- payoutPercent를 확보할 수 없으면 경고 로그 출력, PnL은 0으로 처리

**Payout Gate 규칙**:
- minPayout 체크는 `bestAsset`이 아니라 **현재 차트 자산**(`getCurrentAssetPayout()`)의 payout을 기준으로 한다.
- 현재 자산 payout을 확인할 수 없으면 보수적으로 거래를 차단한다.

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

## 필수 워크플로우

### 1. GitHub Issues 주도 개발

모든 개발 작업은 GitHub Issues를 기반으로 진행합니다.

**라벨**: `feat` | `bug` | `docs` | `refactor` | `test` | `chore` | `p0`(긴급) | `p1`(높음) | `p2`(보통)

**워크플로우**:
1. 이슈 확인/생성
2. `git-worktree`로 분리 worktree + 브랜치 생성 (`<라벨>/<이슈번호>-<설명>`)
3. worktree 경로에서 작업 수행 → 커밋 (`[#이슈번호][모듈] 제목`)
4. PR 생성 (`Closes #이슈번호`)

**컨벤션 상세**: `.github/COMMIT_CONVENTION.md`, `.github/PULL_REQUEST_TEMPLATE.md`

**worktree 강제 규칙 (항상 적용)**:
- 메인 체크아웃(`.../pocket-chrome-extension`)에서 직접 수정하지 않는다.
- 모든 수정은 `git-worktree` 스킬로 생성한 분리 경로에서만 수행한다.
- 기본 경로: `~/worktrees/<project>/<branch-slug>/`
- 작업 완료 기준: `commit` + `push` + `PR 생성`까지 1세트로 처리한다.

**예시**:
```bash
# 예: docs/137-worktree-pr-policy
git worktree add ~/worktrees/pocket-chrome-extension/docs-137-worktree-pr-policy -b docs/137-worktree-pr-policy
cd ~/worktrees/pocket-chrome-extension/docs-137-worktree-pr-policy
git push -u origin docs/137-worktree-pr-policy
gh pr create --title "[#137][docs] worktree 기반 작업 규칙 반영" --body "Closes #137"
```

### 2. 세션 핸드오프 (Session Handoff)

새 세션이 작업을 이어받을 때:

1. `docs/BOARD.md` 읽기 → 현재 활성 태스크, 최근 결정사항, 차단 이슈 확인
2. 해당 GitHub Issue 확인 (`gh issue view N`)
3. 브랜치 diff 확인 → 작업 시작

**작업 완료/중단 시**:
- `docs/BOARD.md`에서 자기 행 업데이트 (status, summary, updated)
- 새 기술 결정이 있었으면 BOARD.md Decisions에 추가

### 3. 문서 하이브리드 전략

| 문서 성격 | 위치 | 이유 |
|-----------|------|------|
| 에이전트 상태판 | **메인 레포** `docs/BOARD.md` | 모든 에이전트가 즉시 접근 |
| 팀간 소통 | **메인 레포** `docs/teams/{team}/inbox.md` | append-only 메시지 큐 |
| 참조용 안정 문서 | **Wiki repo** `../pocket-chrome-extension.wiki` (또는 `docs/wiki` symlink) | 자주 안 바뀌는 문서의 단일 저장소 |
| 작업 이력/회고 | **Wiki repo** `Worklog/` | Daily→Weekly→Monthly 계층 아카이브 |
| 이슈 큐 (클라우드) | **메인 레포** `docs/issue-queue/` | 로컬 LLM이 처리 |
| 과거 문서 아카이브 | **메인 레포** `docs/archive/` | 마이그레이션 중 임시 보관 (정리 대상) |

**중요**: `docs/head/*`는 운영 중단. 새로운 상태/진행/결정 기록은 `docs/BOARD.md`만 사용한다.

**docs/ 구조**:
```
docs/
├── BOARD.md              # 공유 상태판
├── SETUP_GUIDE.md        # 개발 환경 가이드
├── teams/
│   ├── planning/inbox.md # 기획팀 수신함
│   ├── dev/inbox.md      # 개발팀 수신함
│   └── qa/inbox.md       # QA팀 수신함
├── issue-queue/          # 클라우드 이슈 브릿지
├── wiki -> symlink       # Wiki 참조 문서
└── archive/              # 마이그레이션 임시 보관 (필요 시만 참조)
```

**Wiki 페이지** (참조 시 `docs/wiki/` 경유):
Architecture, Data-Flows, DOM-Selectors, Key-Decisions, Trading-Strategies, Setup-Guide, Roadmap

**실제 Wiki 저장소 경로**: 레포지토리와 동등 레벨의 `../pocket-chrome-extension.wiki`

**Worklog 자동화 명령**:
- `npm run wiki:daily` (오늘 Daily 생성)
- `npm run wiki:rollup:weekly` (7일 경과 Daily -> Weekly)
- `npm run wiki:rollup:monthly` (1개월 경과 Weekly -> Monthly)
- `npm run wiki:rollup` (Daily 생성 + 전체 롤업)

### 4. 멀티 에이전트 / 팀 규칙

1. 에이전트는 `BOARD.md`에서 **자기 행만** 수정 (다른 에이전트 행 수정 금지)
2. 브랜치는 반드시 분리 (같은 파일 동시 수정 금지)
3. 새 기술 결정은 `BOARD.md` Decisions에 append, 5개 초과 시 Wiki [[Key-Decisions]]로 이동
4. 차단 사항은 `BOARD.md` Blocked 섹션에 기록
5. **팀간 소통**: 상대 팀의 `inbox.md`에 append → 수신 팀이 처리 후 삭제
6. **팀 역할**: Planning(요구사항/우선순위), Dev(설계/구현), QA(테스트/버그리포트)

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
| WebSocket 후킹 수정 | `src/content-script/inject-websocket.js` |
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
| WebSocket 데이터 수신 안됨 | Extension 미로드 또는 WS hook 오류 | Extension 재로드 + 페이지 새로고침 |
| WS 후킹 중복 실행 경고 | 스크립트가 이미 주입됨 | `__pocketQuantWsHook` 플래그로 자동 감지, 페이지 새로고침 |

---

## 이슈 관리 규칙

**모든 작업은 GitHub Issue를 먼저 생성한 후 커밋합니다.**

예외 (이슈 없이 커밋 가능): 긴급 핫픽스, 보안 패치, 오타 수정 (1-2줄). `[-]`로 표기.

이슈 생성 시 `.github/ISSUE_TEMPLATE/` 참조. 1 PR = 1 이슈 원칙.

**Issue Queue** (클라우드 LLM 환경): `docs/issue-queue/` 경유. `/queue-issue` skill 사용.
