# Pocket Quant 개발 운영 가이드

LLM 에이전트 및 개발자가 참조하는 실행/테스트/백테스트/로그 가이드입니다.

---

## 목차

1. [개발 환경 구축](#1-개발-환경-구축)
2. [서버 실행](#2-서버-실행)
3. [테스트 실행](#3-테스트-실행)
4. [백테스트 실행](#4-백테스트-실행)
5. [백테스트 결과 분석](#5-백테스트-결과-분석)
6. [로그 시스템 및 해석](#6-로그-시스템-및-해석)

---

## 1. 개발 환경 구축

### 사전 요구사항

- Node.js 18+
- npm
- Chrome 브라우저 (Extension 로드용)
- (선택) PM2 — 데이터 수집 서버 백그라운드 실행 시

### 초기 설정

```bash
# 의존성 설치
npm install

# 개발 빌드 (Chrome에 로드할 Extension 생성)
npm run dev
```

### Chrome Extension 로드

1. `chrome://extensions` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" → `dist/` 폴더 선택
4. Pocket Option 데모 계정으로 접속하여 동작 확인

### 빌드 명령어 요약

| 명령어 | 용도 | host_permissions |
|--------|------|------------------|
| `npm run dev` | 개발 서버 (HMR) | PO 도메인 + `localhost:3001` |
| `npm run build:dev` | 개발용 정적 빌드 | PO 도메인 + `localhost:3001` |
| `npm run build` | 프로덕션 빌드 | PO 도메인만 (최소 권한) |

> 개발 빌드에서만 `DataSender`(localhost:3001 전송)가 활성화됩니다. 프로덕션에서는 no-op 처리됩니다.

---

## 2. 서버 실행

### Data Collector Server (localhost:3001)

Extension에서 수집한 가격 데이터를 SQLite에 저장하는 Express 서버입니다.

**소스**: `scripts/data-collector-server.ts`

#### 포그라운드 실행

```bash
npm run collector
# → http://localhost:3001 에서 실행
# → DB 경로: data/market-data.db
```

#### PM2 백그라운드 실행

```bash
# 시작
npm run collector:start

# 로그 확인
npm run collector:logs

# 중지
npm run collector:stop

# PM2 모니터링 대시보드
pm2 monit
```

PM2 설정: `scripts/ecosystem.config.cjs`
- 자동 재시작 (max 10회, 2초 간격)
- 로그 파일: `data/logs/collector-out.log`, `data/logs/collector-error.log`

#### Docker 실행 (권장 — 운영 환경)

```bash
# 빌드 + 백그라운드 실행
npm run collector:docker:up
# 또는: docker compose up -d collector

# 로그 확인
npm run collector:docker:logs
# 또는: docker compose logs -f collector

# 중지
npm run collector:docker:down
# 또는: docker compose down
```

**소스**: `apps/collector/` (독립 패키지, extension 코드에 의존하지 않음)

**아키텍처**:
- `apps/collector/Dockerfile`: multi-stage 빌드 (Node 20, better-sqlite3 네이티브 컴파일)
- `docker-compose.yml`: 서비스 정의, 볼륨, 헬스체크
- 컨테이너는 non-root 사용자(`collector:1001`)로 실행됨

**SQLite 볼륨**:
- Docker named volume `collector-data`가 `/data/market-data.db`로 마운트됨
- 컨테이너 재시작/재빌드에도 데이터 유지
- 볼륨 위치 확인: `docker volume inspect pocket-chrome-extension_collector-data`

**헬스체크**:
- 30초 간격으로 `GET /health` 자동 호출
- `docker ps`에서 `healthy/unhealthy` 상태 확인 가능

```bash
# 헬스체크 확인
curl http://localhost:3001/health
# → {"status":"ok","totalCandles":...,"totalTicks":...,"totalCandles1m":...}

# 샘플 데이터 전송 (테스트)
curl -X POST http://localhost:3001/api/candles/bulk \
  -H "Content-Type: application/json" \
  -d '{"candles":[{"symbol":"EURUSD_otc","interval":"1m","timestamp":1700000000000,"open":1.1,"high":1.11,"low":1.09,"close":1.105}]}'
```

#### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PROJECT_ROOT` | 프로젝트 루트 | 프로젝트 경로 |
| `DB_PATH` | `data/market-data.db` | SQLite DB 위치 |
| `PORT` | `3001` | 서버 포트 |

#### API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 + 테이블별 레코드 수 |
| `POST` | `/api/tick` | 단일 tick 저장 |
| `POST` | `/api/ticks/bulk` | 다중 tick 벌크 저장 |
| `POST` | `/api/candle` | 단일 캔들 저장 (레거시 호환) |
| `POST` | `/api/candles/bulk` | 다중 캔들 벌크 저장 |
| `GET` | `/api/candles` | 레거시 캔들 조회 (`?symbol=&interval=&start=&end=`) |
| `GET` | `/api/ticks` | tick 조회 (`?symbol=&start=&end=&source=`) |
| `GET` | `/api/candles_1m` | 1분봉 캐시 조회/자동 리샘플링 (`?symbol=&start=&end=`) |
| `GET` | `/api/candles/resampled` | 커스텀 interval 리샘플링 (`?symbol=&interval=1m&start=&end=`) |
| `GET` | `/api/candles/stats` | 자산별 수집 통계 |
| `GET` | `/api/ticks/stats` | tick 통계 (심볼 × source별) |
| `GET` | `/api/candles_1m/stats` | 1분봉 캐시 통계 |
| `GET` | `/api/candles/stats/detailed` | 3개 테이블 종합 통계 |
| `POST` | `/api/candles_1m/resample` | 수동 리샘플링 트리거 (`{symbol}`) |
| `POST` | `/api/migrate/candles-to-ticks` | 레거시 candles → ticks 마이그레이션 |

#### 서버 상태 확인

```bash
curl http://localhost:3001/health
# → {"status":"ok","totalCandles":1234,"totalTicks":5678,"totalCandles1m":900}
```

#### 데이터 흐름

```
Extension (Content Script)
  → DataSender (HTTP POST)
    → localhost:3001 (/api/tick, /api/candles/bulk)
      → SQLite (ticks 테이블, candles 레거시 테이블)
        → 조회 시 candles_1m으로 리샘플링/캐싱
```

---

## 3. 테스트 실행

### 프레임워크

- **Vitest** (v2.1.8) + jsdom 환경
- **React Testing Library** — UI 컴포넌트
- **Setup**: `src/test/setup.ts` — Chrome API mock 자동 주입

### 기본 실행

```bash
# 대화형 watch 모드 (개발 시 추천)
npm test

# 1회 실행 (CI용, 백테스트 제외)
npm run test:ci

# 커버리지 리포트
npm run test:coverage
# → coverage/index.html에서 HTML 리포트 확인
```

### 특정 테스트 실행

```bash
# 파일명 패턴 매칭
npm test -- indicators
npm test -- executor
npm test -- db

# 특정 파일 지정
npm test -- src/lib/indicators/index.test.ts

# 특정 테스트명 매칭 (-t)
npm test -- -t "RSI"
npm test -- -t "should calculate SMA"
```

### 커버리지 기준 (thresholds)

| 항목 | 최소 기준 |
|------|----------|
| Statements | 60% |
| Branches | 50% |
| Functions | 60% |
| Lines | 60% |

> `npm run test:coverage` 실행 시 기준 미달이면 실패합니다.

### 테스트 구조

```
src/
├── lib/
│   ├── indicators/index.test.ts    # 기술적 지표 (SMA, EMA, RSI, MACD 등)
│   ├── db/__tests__/db.test.ts     # IndexedDB CRUD
│   ├── backtest/
│   │   ├── engine.test.ts          # 백테스트 엔진
│   │   └── strategies/*.test.ts    # 개별 전략 테스트
│   └── ...
├── content-script/
│   ├── executor.test.ts            # 거래 실행기
│   └── ...
├── side-panel/
│   └── components/__tests__/       # React UI 컴포넌트
└── test/
    └── setup.ts                    # Chrome API mock 설정
```

### Chrome API Mock

테스트 환경에서는 `src/test/setup.ts`가 `globalThis.chrome`에 mock을 자동 주입합니다:
- `chrome.runtime.sendMessage` → `vi.fn().mockResolvedValue(null)`
- `chrome.storage.local.get/set` → mock
- `chrome.tabs.query/sendMessage` → mock
- 각 테스트 전 `vi.clearAllMocks()` 자동 실행

### 새 테스트 작성 가이드

```typescript
// src/lib/my-module/my-module.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from './my-module'

describe('myFunction', () => {
  it('should return expected result', () => {
    expect(myFunction(input)).toBe(expected)
  })
})
```

- 소스 파일과 같은 디렉토리에 `*.test.ts` 생성
- `globals: true` 설정이므로 `describe/it/expect`는 import 없이 사용 가능 (명시적 import 권장)
- Chrome API 의존 코드는 `src/test/setup.ts`의 mock을 활용

### E2E 테스트 (Playwright)

```bash
# 전체 E2E
npm run test:e2e

# 진단 테스트 (headed 모드)
npm run test:e2e:diagnostic

# CDP 진단
npm run test:e2e:cdp
```

> E2E 테스트는 Vitest 실행에서 자동 제외됩니다 (`tests/e2e/**`).

### 코드 품질 도구

```bash
npm run lint          # ESLint 체크
npm run lint:fix      # ESLint 자동 수정
npm run format        # Prettier 포맷팅
npm run format:check  # Prettier 체크만
npm run type-check    # TypeScript 타입 체크 (noEmit)
```

---

## 4. 백테스트 실행

### 아키텍처 개요

```
BacktestEngine.run(config, candles)
  → 전략의 generateSignal(candles, params) 호출
  → 신호에 따라 가상 거래 실행
  → 승/패/무승부 판정 + 통계 산출
  → BacktestResult 반환

runLeaderboard(candles, config)
  → 등록된 모든 전략에 대해 Engine.run() 일괄 실행
  → 최소 거래 횟수 필터링
  → 종합 점수(compositeScore) 계산 → 랭킹
  → LeaderboardResult 반환
```

### 핵심 코드

| 파일 | 역할 |
|------|------|
| `src/lib/backtest/engine.ts` | 백테스트 엔진 (`BacktestEngine.run`) |
| `src/lib/backtest/leaderboard.ts` | 리더보드 일괄 실행 (`runLeaderboard`) |
| `src/lib/backtest/types.ts` | `BacktestConfig`, `BacktestResult`, `Strategy` 등 타입 |
| `src/lib/backtest/statistics.ts` | 상세 통계 계산 (`calculateDetailedStatistics`) |
| `src/lib/backtest/leaderboard-types.ts` | `LeaderboardEntry`, `LeaderboardConfig`, 가중치 |
| `src/lib/backtest/strategies/` | 전략 구현체들 (RSI, MACD, Bollinger 등) |
| `src/lib/backtest/index.ts` | 전략 등록 및 엔진 초기화 |
| `scripts/run-backtest-report.ts` | CLI 리포트 생성기 |

### CLI 백테스트 리포트 실행

```bash
npx tsx scripts/run-backtest-report.ts
```

**전제조건**: `data/` 디렉토리에 JSON 캔들 데이터 파일이 필요합니다.

**데이터 파일 형식** (`data/*.json`):
```json
{
  "candles": [
    { "timestamp": 1700000000000, "open": 1.1000, "high": 1.1010, "low": 1.0990, "close": 1.1005, "volume": 100 }
  ]
}
```
또는 배열 직접:
```json
[
  [1700000000000, "1.1000", "1.1010", "1.0990", "1.1005", "100"]
]
```

**기본 설정** (`scripts/run-backtest-report.ts`):

| 항목 | 값 | 설명 |
|------|-----|------|
| `MAX_CANDLES` | 300 | O(n²) 엔진 특성상 현실적 상한 |
| `INITIAL_BALANCE` | $10,000 | 초기 자본금 |
| `BET_AMOUNT` | $100 | 고정 거래 금액 |
| `PAYOUT` | 92% | Pocket Option 기본 페이아웃 |
| `MIN_TRADES` | 5 | 300캔들에서의 최소 거래 횟수 |
| `BREAKEVEN_WR` | 52.1% | 92% 페이아웃 손익분기 승률 |

**출력 파일** (`data/results/`):
- `backtest-report-YYYY-MM-DD.md` — 일자별 마크다운 리포트
- `backtest-report-latest.md` — 최신 리포트 (덮어쓰기)
- `backtest-report-latest.json` — 구조화된 JSON 데이터

### 등록된 전략 그룹

| 그룹 | 파일 | 전략 예시 |
|------|------|-----------|
| RSI | `strategies/rsi-strategy.ts` | RSI Overbought/Oversold, RSI Divergence, RSI+BB, RSI+Stochastic, RSI+Trend |
| Bollinger | `strategies/bollinger-strategy.ts` | BB Squeeze, BB Bounce |
| MACD | `strategies/macd-strategy.ts` | MACD Cross, MACD Histogram |
| Stochastic RSI | `strategies/stochastic-rsi-strategy.ts` | StochRSI Cross |
| SMMA | `strategies/smma-stochastic.ts` | SMMA+Stochastic (normal/aggressive) |
| ATR | `strategies/atr-breakout-strategy.ts` | ATR Breakout |
| CCI | `strategies/cci-strategy.ts` | CCI OB/OS, CCI Zero Cross, CCI Trend |
| Williams %R | `strategies/williams-r-strategy.ts` | Williams 3가지 변형 |

### 프로그래밍 방식 백테스트

```typescript
import { getBacktestEngine } from './src/lib/backtest/engine'
import { runLeaderboard } from './src/lib/backtest/leaderboard'
import type { BacktestConfig, Candle } from './src/lib/backtest/types'

// 단일 전략 백테스트
const engine = getBacktestEngine()
const config: BacktestConfig = {
  symbol: 'EURUSD_otc',
  startTime: candles[0].timestamp,
  endTime: candles[candles.length - 1].timestamp,
  initialBalance: 10000,
  betAmount: 100,
  betType: 'fixed',
  payout: 92,
  expirySeconds: 60,
  strategyId: 'rsi-overbought-oversold',
  strategyParams: { period: 14, overbought: 70, oversold: 30 },
}
const result = engine.run(config, candles)

// 전체 전략 리더보드
const leaderboard = runLeaderboard(candles, {
  symbol: 'EURUSD_otc',
  startTime: candles[0].timestamp,
  endTime: candles[candles.length - 1].timestamp,
  initialBalance: 10000,
  betAmount: 100,
  betType: 'fixed',
  payout: 92,
  expirySeconds: 60,
  volumeMultiplier: 100,
  minTrades: 30,
})
```

### 데이터 수집 → 백테스트 파이프라인

```
1. Extension + Collector Server로 데이터 수집
   → data/market-data.db (SQLite)

2. Collector API에서 JSON으로 캔들 추출
   GET /api/candles_1m?symbol=EURUSD_otc&start=...&end=...
   → 결과를 data/EURUSD_otc_1m.json에 저장

3. 백테스트 리포트 실행
   npx tsx scripts/run-backtest-report.ts
   → data/results/backtest-report-latest.md
```

---

## 5. 백테스트 결과 분석

### 리포트 구조

CLI 리포트(`data/results/backtest-report-latest.md`)에는 다음이 포함됩니다:

1. **설정 요약** — 초기자금, 거래금액, 페이아웃, 손익분기 승률
2. **데이터셋별 리더보드** — 전략 랭킹 테이블
3. **수익성 전략 랭킹** — 손익분기 이상 + 최소 거래 수 충족 전략
4. **크로스 데이터셋 일관성** — 3개 이상 데이터셋에서 통과한 전략

### 핵심 지표 해석

#### 기본 지표

| 지표 | 의미 | 좋은 기준 |
|------|------|-----------|
| **Win Rate (승률)** | 전체 거래 중 승리 비율 | ≥ 52.1% (92% 페이아웃 손익분기) |
| **Profit Factor (PF)** | 총이익 ÷ 총손실 | > 1.0 수익, > 1.5 양호, > 2.0 우수 |
| **Net Profit (순이익)** | 총 순수익 ($) | 양수 = 수익 |
| **Total Trades (거래 수)** | 백테스트 기간 내 전체 거래 횟수 | 통계적 유의성을 위해 30+ 권장 |

#### 리스크 지표

| 지표 | 의미 | 해석 |
|------|------|------|
| **MDD % (최대 낙폭)** | 고점 대비 최대 자본 감소 비율 | < 10% 안전, < 20% 보통, > 30% 위험 |
| **Max Consecutive Losses (최대 연속손실)** | 연속 패배 횟수 | 자금 관리의 버퍼 기준. 5+ 시 주의 |
| **Recovery Factor** | 순이익 ÷ MDD | > 2.0 양호 (MDD 2배 이상 복구 가능) |
| **Sharpe Ratio** | 위험 대비 수익 (변동성 조정) | > 1.0 양호, > 2.0 우수 |
| **Sortino Ratio** | 하방 위험 대비 수익 (하방 편차만 사용) | > 1.0 양호 (Sharpe보다 보수적) |
| **Calmar Ratio** | 수익률 ÷ MDD | > 1.0 양호 |

#### 거래량/안정성 지표

| 지표 | 의미 | 해석 |
|------|------|------|
| **Composite Score** | 가중 종합 점수 (0-100) | 여러 지표를 종합. 리더보드 정렬 기준 |
| **Kelly Fraction** | Kelly Criterion 최적 배팅 비율 | `(p×b - q) / b`. 양수면 +EV |
| **Trades/Day** | 일 평균 거래 횟수 | 거래량 목표 달성 소요일 계산에 사용 |
| **Win Rate StdDev** | 주별 승률 표준편차 | 낮을수록 안정적 (< 10% 안정) |

#### 종합 점수 (Composite Score) 가중치

```
승률(winRate)         × 0.35
이익팩터(profitFactor) × 0.20
MDD 역점수            × 0.15
연속손실 역점수        × 0.10
일거래횟수             × 0.10
회복팩터               × 0.10
─────────────────────────────
합계                   = 1.00
```

> 각 지표는 0-100으로 정규화된 후 가중합으로 종합 점수를 산출합니다. MDD와 연속손실은 "역방향"이므로 낮을수록 높은 점수를 받습니다.

### 손익분기 승률 공식

바이너리 옵션에서 수익을 내려면:

```
손익분기 승률 = 100 / (100 + 페이아웃%)

92% 페이아웃 → 100 / 192 ≈ 52.1%
```

**리포트에서 승률이 52.1% 이상인 전략만 수익성이 있습니다.**

### 결과 신뢰성 판단 기준

| 항목 | 조건 | 설명 |
|------|------|------|
| 거래 횟수 | ≥ 30 | 30 미만은 통계적 유의성 부족 |
| 크로스 데이터셋 | 3+ 데이터셋에서 수익 | 단일 데이터셋 결과는 과적합 가능 |
| Kelly Fraction | > 0% | 음수면 장기적으로 손실 기대 |
| Win Rate StdDev | < 15% | 주별 승률 편차가 크면 불안정 |

### 데이터 품질 (`BacktestResult.dataQuality`)

백테스트 결과에 포함되는 데이터 품질 진단:

| 필드 | 의미 |
|------|------|
| `totalCandles` | 처리된 캔들 수 |
| `gapCount` | 감지된 갭(누락) 수 |
| `totalMissingCandles` | 추정 누락 캔들 수 |
| `coveragePercent` | 데이터 커버리지 (100%에 가까울수록 좋음) |
| `duplicatesRemoved` | 제거된 중복 |
| `gapStrategy` | 갭 처리 전략 (`skip`/`fill`/`split`) |
| `warnings` | 데이터 관련 경고 메시지 |

### JSON 리포트 활용

`data/results/backtest-report-latest.json`은 프로그래밍 방식으로 결과를 분석할 때 사용합니다:

```typescript
const report = JSON.parse(fs.readFileSync('data/results/backtest-report-latest.json', 'utf-8'))

// 전체 수익성 전략 필터
const profitable = report.datasets
  .flatMap(d => d.entries)
  .filter(e => e.winRate >= 52.1 && e.trades >= 10)

// 크로스 데이터셋 일관성 확인
report.summary.crossDatasetConsistency
  .filter(c => c.profitableCount === c.datasets)
  // → 모든 데이터셋에서 수익인 전략
```

---

## 6. 로그 시스템 및 해석

### 로그 시스템 개요

모듈별 색상 구분 로거 (`src/lib/logger/index.ts`)

- 모든 로그는 `[PO] [Module]` 접두사로 시작
- 브라우저에서는 `console.*` + CSS 컬러, Node에서는 plain text
- 설정은 `localStorage['pq-logger-config']`에 영구 저장

### 로그 레벨

```
debug (0) < info (1) < warn (2) < error (3) < none (4)
```

기본 레벨은 `info`입니다. `debug`는 고빈도 데이터 로그(매 tick 등)에 사용됩니다.

### 모듈별 로거

| 로거 | 모듈 | 색상 | 주요 로그 내용 |
|------|------|------|----------------|
| `loggers.ws` | WS | Cyan `#0ff` | WebSocket 연결/메시지 수신/전송 |
| `loggers.parser` | Parser | Purple `#80f` | WS 메시지 파싱 (candle_history, price_update) |
| `loggers.collector` | Collector | Green `#0f0` | DOM 가격 캡처, MutationObserver 이벤트 |
| `loggers.miner` | Miner | Yellow `#ff0` | 자동 채굴 순회, 자산 전환, 히스토리 요청 |
| `loggers.dataSender` | DataSender | Orange `#f80` | localhost:3001 HTTP 전송 |
| `loggers.executor` | Executor | Red `#f00` | 거래 실행, 금액 설정, 데모 모드 체크 |
| `loggers.signal` | Signal | Blue `#08f` | 신호 생성, 레짐 감지, 전략 선택 |
| `loggers.monitor` | Monitor | Magenta `#f0f` | 시스템 상태 모니터링 |
| `loggers.background` | Background | Gray `#888` | Service Worker 메시지 라우팅, DB 저장 |
| `loggers.ui` | UI | Light Blue `#4af` | Side Panel React UI 이벤트 |

### 편의 메서드 (이모지 접두사)

| 메서드 | 이모지 | 용도 | 레벨 |
|--------|--------|------|------|
| `.success()` | ✅ | 작업 성공 | info |
| `.fail()` | ❌ | 작업 실패 | error |
| `.start()` | 🚀 | 프로세스 시작 | info |
| `.stop()` | ⏹ | 프로세스 중지 | info |
| `.data()` | 📦 | 데이터 관련 | debug |
| `.signal()` | 🎯 | 매매 신호 | info |
| `.trade()` | 💰 | 거래 실행 | info |

### 브라우저 콘솔 제어 (window.pqLog)

Extension이 로드된 탭의 DevTools 콘솔에서:

```javascript
// 현재 설정 확인
pqLog.status()

// 디버그 모드 (모든 로그 출력)
pqLog.enableDebug()

// 에러만 표시
pqLog.quiet()

// 특정 모듈만 포커스
pqLog.focus('WS', 'Parser')

// 특정 모듈 음소거
pqLog.mute('DataSender', 'Collector')

// 기본값 복원
pqLog.reset()
```

### 상황별 로그 해석 가이드

#### WebSocket 데이터 수신 문제

```javascript
pqLog.focus('WS', 'Parser')
pqLog.enableDebug()
```

**정상 패턴**:
```
[PO] [WS] 🚀 WebSocket interceptor initialized
[PO] [WS] ✅ Bridge ready
[PO] [Parser] candle_history received: EURUSD_otc, 300 candles
[PO] [Parser] price_update: EURUSD_otc @ 1.1005
```

**문제 상황**:
- `Bridge ready` 없음 → Tampermonkey 스크립트가 미설치/비활성화
- `candle_history` 없음 → WS 메시지 파싱 실패 → `websocket-parser.ts` 점검
- Parser 로그 자체가 없음 → `websocket-interceptor.ts`에서 메시지가 도달하지 않음

#### 거래 실행 문제

```javascript
pqLog.focus('Executor', 'Signal')
```

**정상 패턴**:
```
[PO] [Signal] 🎯 CALL signal: RSI Oversold (confidence: 0.82)
[PO] [Executor] ✅ Demo mode verified
[PO] [Executor] 💰 Executing CALL, amount: $100
```

**문제 상황**:
- `❌ Demo mode check failed` → URL/DOM에 데모 모드 표시가 없음. 데모 계정 로그인 확인
- `❌ Button not found` → DOM 셀렉터 변경됨. `DOMSelectors` 업데이트 필요
- Signal 로그 없음 → 캔들 버퍼 부족 또는 신호 조건 미충족

#### 데이터 수집 문제

```javascript
pqLog.focus('Collector', 'DataSender', 'Miner')
pqLog.enableDebug()
```

**정상 패턴**:
```
[PO] [Miner] 🚀 Auto mining started
[PO] [Miner] 📦 Switching to EURUSD_otc (payout: 92%)
[PO] [DataSender] ✅ Sent 300 candles to collector
```

**문제 상황**:
- `DataSender` 에러 → Collector Server 미실행. `npm run collector` 실행
- `Miner` 로그 없음 → Auto Miner가 시작되지 않음. Content Script 주입 확인
- `📦 Switching` 없음 → 고페이아웃 자산을 찾지 못함. `payout-monitor.ts` 점검

### Collector Server 로그 (Node.js)

PM2 사용 시: `npm run collector:logs`
포그라운드 사용 시: 터미널 출력

```
# 정상 데이터 수신
[14:30:15] Saved tick: EURUSD_otc @ 1700000000000
[14:30:16] Bulk saved: 300 candles + 280 ticks (symbol: EURUSD_otc)

# 에러 (잘못된 데이터)
[Bulk] Validation failed for 1+ candles. First failure: index 0 - Missing required fields: close

# 리샘플링 캐시
[Cache] EURUSD_otc: 150 new candles cached from 9000 ticks
```

---

## 부록: 자주 쓰는 명령어 요약

```bash
# 개발 환경
npm run dev              # Extension 개발 빌드 + HMR
npm run collector        # 데이터 수집 서버 실행
npm run build            # 프로덕션 빌드

# 테스트
npm test                 # 대화형 watch 모드
npm run test:ci          # CI 1회 실행 (백테스트 제외)
npm run test:coverage    # 커버리지 리포트

# 코드 품질
npm run lint             # ESLint
npm run format           # Prettier
npm run type-check       # TypeScript 체크

# 백테스트
npx tsx scripts/run-backtest-report.ts  # 종합 리포트 생성

# 서버 관리 (PM2)
npm run collector:start  # 백그라운드 시작
npm run collector:stop   # 중지
npm run collector:logs   # 로그 확인
```
