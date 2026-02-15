# Pocket Quant Trader - Progress

**최종 업데이트:** 2026-02-15 KST

## (2026-02-15) 파이프라인 정합성/관측성 강화 + 백테스트 평점 시스템

### 완료 항목
- **[1A] TickRepository.bulkPut**: 기존 코드 확인 (이미 정상) + TickBuffer flush → DB count 증가 통합 테스트 추가
- **[1B] DataSender.sendHistory**: bulkSendCount 증가 위치 수정 (유효 캔들 필터링 후로 이동), 재시도 로직(3회, 지수 backoff) 추가
- **[2A] 히스토리 캔들 IndexedDB 저장**: `saveHistoryCandlesToDB()` 함수 추가 (1000개 청크 + requestIdleCallback), CandleDatasetRepository 메타 갱신
- **[2B] 서버 장애 대비**: sendHistory에 최대 3회 재시도(1s/2s/4s backoff) 구현, HTTP 에러는 재시도 안 함
- **[3A] TickBuffer UI 관측성**: DBMonitorDashboard에 tick buffer stats 섹션 추가 (bufferSize, accepted/dropped ratio, flushed, retentionDeleted, DB tick count)
- **[3B] 진단 버튼**: "Flush Now" / "Run Retention" 버튼 추가, FLUSH_TICK_BUFFER/RUN_TICK_RETENTION 메시지 핸들러 추가
- **[4A] 백테스트 Score 시스템**: `src/lib/backtest/scoring.ts` — 7가지 지표 가중치 기반 0-100 종합 점수 + A~F 등급
- **[4B] 스냅샷 테스트**: 23개 테스트 (55%/52.1%/40%/65% WR 시나리오, 엣지케이스, 커스텀 가중치)
- **[5A] 아키텍처 다이어그램**: `docs/architecture/data-flows.md` — tick/trade/storage/observability mermaid 4개 다이어그램
- **[5B] 문서 규칙 갱신**: DOCUMENTATION_RULES.md에 Score 기준표, 전략 선택 절차, 변경 시 동반 업데이트 규칙 추가
- **[6] 병렬 작업 소유권**: parallel-work.md에 Agent별 파일 소유권 테이블 + 공유 파일 coordination 규칙 추가

### 테스트 결과
- 신규/수정 테스트 58개 전체 통과
- TypeScript 컴파일 에러 0건

### 다음 행동
- DBMonitorDashboard에서 실환경 tick/candle/서버 수집 상태 확인
- Score 시스템을 리더보드 기존 `compositeScore`와 통합 검토
- 실 데이터로 scoring 가중치 미세 조정

## (2026-02-14) Tick DB 안정성 개선 — 배치 저장 + 샘플링 + 강제 retention

- **TickRepository 강화**: `bulkPut` (upsert), `deleteOldestToLimit` (count cap), `getStats` (관측성) 추가
- **TickStoragePolicy 타입**: `sampleIntervalMs`, `batchSize`, `flushIntervalMs`, `maxTicks`, `maxAgeMs` 정책 인터페이스
- **TickBuffer 모듈**: `src/background/tick-buffer.ts` — 티커별 샘플링 + 배치 flush + 주기적 retention
- **Background 통합**: `handleTickData` → `TickBuffer.ingest()`로 교체, `cleanupOldData` → `TickBuffer.runRetention()`
- **관측성**: `GET_TICK_BUFFER_STATS` 메시지 타입 추가 (buffer + DB 통합 stats)
- **테스트**: 26개 신규 (TickRepository 10 + TickBuffer 16), 전체 752개 통과
- 다음 행동: 실환경 고빈도 tick 시 모니터링, DBMonitorDashboard에 tick stats UI 연동 검토
- 상세: `docs/features/tick-db-stability/`

## (2026-02-14) 이중 저장소 아키텍처 문서화 — IndexedDB vs Local Collector 분리

- **목표**: "데이터가 어디에 저장되는지" 신규 개발자가 빠르게 이해할 수 있도록 문서 정비
- **문제**: local-database 문서가 IndexedDB만 설명하고, 실제 주력 히스토리 저장소인 Local Collector(SQLite)가 미문서화
- **수정 파일**:
  - `docs/architecture/local-database/README.md` — IndexedDB 전용으로 재작성 (v6 스키마, 8테이블, ER 다이어그램, 보관 정책, 제약사항)
  - `docs/architecture/local-collector/README.md` — 신규 생성 (Express+SQLite, 3테이블, 15개 API 엔드포인트, 리샘플 엔진, 데이터 흐름 시나리오)
  - `docs/head/map.md` — "데이터 저장소 — 이중 구조" 섹션으로 개편 (비교표 + Mermaid 구조도 + 교차참조)
  - `docs/head/findings.md` — 이중 저장소 결정사항 추가
- **Mermaid 다이어그램**: ER 다이어그램(IndexedDB), 플로우차트(Collector 전체 구조), 시퀀스(리샘플 흐름)
- 다음 행동: 필요 시 retention 자동화(SQLite 오래된 데이터 정리) 검토
- 상세: `docs/architecture/local-database/`, `docs/architecture/local-collector/`

## (2026-02-13) Side Panel 아키텍처 리팩토링 — extensionClient 추출

- **목표**: Chrome API 호출을 side-panel 컴포넌트/훅에서 분리하여 테스트/목킹 용이한 구조로 전환
- **새 모듈**: `src/side-panel/infrastructure/extension-client.ts` — 모든 Chrome 메시징 추상화
- **새 훅**: `src/side-panel/hooks/useSignalStatus.ts` — SignalPanel에서 상태 로직 추출
- **리팩토링 대상**: useTradingStatus, useTrades, SignalPanel, AutoMinerControl, HistoryMiner, DBMonitorDashboard, SettingsPanel
- **결과**: side-panel 내 직접 `chrome.*` 호출 14건 → 0건 (infrastructure 레이어만 보유)
- **테스트**: 기존 39개 통과 + extensionClient 10개 테스트 추가 (총 49개)
- **TypeScript**: 컴파일 에러 0건
- 다음 행동: 필요시 useAutoMiner, useDBMonitor 등 추가 훅 추출
- 상세: `docs/features/side-panel-refactor/`

## (2026-02-13) SBB-120 (Squeeze Bollinger Breakout) 전략 구현

- **전략**: Bollinger BandWidth squeeze 감지 후 breakout 방향으로 120초 만기 거래
- **신규 파일**: `src/lib/backtest/strategies/sbb-120.ts`
- **타입 확장**: `StrategyResult.expiryOverride?: number` 추가 (하위호환)
- **SignalGeneratorV2 통합**:
  - `createSignal`에서 `expiryOverride` 우선 적용
  - `selectStrategy`에서 ranging 구간 SBB-120 우선 → rsiBBBounce 폴백
- **가짜돌파 방어 3가지**: breakoutMargin, bodyRatio, volatility expansion
- **테스트**: 17개 테스트 통과, 기존 125개 전략 테스트 통과
- 다음 행동: 실데이터 백테스트로 승률 52.1%+ 검증
- 상세: `docs/features/sbb-120-strategy/`

## (2026-02-13) TIF-60 (Tick Imbalance Fade) 전략 구현

- **새 전략**: TIF-60 — 틱 불균형 기반 역추세(되돌림) 매매
- **이론 근거**: OIB-reversal (Sirnes 2021, Chordia et al. 2002), 초단기 리버설 (Heston et al. 2010)
- **파일 추가**: `src/content-script/tick-strategies.ts` (코어 전략)
- **파일 수정**: `src/content-script/index.ts` (setupCandleHandler에 TIF-60 통합)
- **테스트**: 12개 통과 (결정적 시나리오 포함)
- **동작 모드**: 독립 모드(기본) / SignalGeneratorV2 방향 합의 모드(옵션)
- **파라미터**: windowSec=20, minTicks=80, imbalanceThreshold=0.65, deltaZThreshold=2.0
- 다음 행동: 실환경 틱 데이터로 승률 검증, 자산별 파라미터 튜닝
- 상세: `docs/features/tif-60-strategy/`

## (2026-02-13) ZMR-60 전략 구현 및 SignalGeneratorV2 통합

- **ZMR-60 전략 모듈**: `src/lib/backtest/strategies/zmr-60.ts`
  - 1분 로그수익률 Z-score 기반 평균회귀 전략
  - 다중 확인 필터: RSI(7) + BB(20,2) + Candle wick rejection
  - 이론적 근거: Heston/Korajczyk/Sadka(2010), Rif/Utz(2021)
- **SignalGeneratorV2 통합**: 횡보장(ADX<25)에서 RSI+BB와 이중 확인
  - 3가지 모드: consensus(기본, 동일 방향만), best(높은 confidence), off
  - zmr60MergeMode + zmr60Config 설정 추가
- **테스트**: 16개 통과 (전체 strategy 테스트 124개 통과)
- **문서**: 3-file-pattern 완비 (`docs/features/zmr-60-strategy/`)
- 다음 행동: 실환경 데이터로 forward test, walk-forward 검증
- 상세: `docs/features/zmr-60-strategy/`

## (2026-02-12) Tick/Candle 테이블 분리 + Timestamp 정규화

- **Tick 전용 테이블**: ticks (symbol, ts_ms, price, source) — 원본 고빈도 데이터
- **1분봉 캐시 테이블**: candles_1m (symbol, ts_ms, OHLCV, source) — 리샘플 결과
- **Timestamp 정규화**: toEpochMs() 유틸 함수로 모든 입력을 ms 정수로 통일
- **수집 서버**: candles + ticks 이중 저장, 신규 API 9개 추가
- **백테스트**: candles_1m 캐시 우선 → ticks 폴백 → candles(레거시) 폴백
- **진단/마이그레이션**: scripts/diagnose-timestamps.ts (--migrate 플래그)
- 테스트: 65개 통과 (time: 32, tick-resampler: 33)
- 다음 행동: 실환경 데이터 수집 → 마이그레이션 → 백테스트 캐시 성능 확인
- 상세: `docs/features/tick-candle-separation/`

## (2026-02-08) Bulk History Mining — Fix 7 코드 적용, 실환경 검증 대기

- **Fix 1~6**: 파이프라인 파싱 + 자산 전환 + Asset ID + TM 제거 (상세: 이전 로그)
- **DataSender (passive)**: ✅ 실환경 성공 — `1449 candles #AAPL_OTC` 수집 완료
- **Fix 7 적용**: switchAsset 오분류 버그 수정 — `markAssetUnavailable` 제거 + 폴링 체크 + 이중 셀렉터
  - 빌드 성공, 테스트 106/106 통과
- 다음 행동: 익스텐션 리로드 → AutoMiner 실행 → 자산 전환 성공 여부 확인
- 상세: `docs/features/bulk-history-db-bug/progress.md` 세션 12

## (2026-02-06) 병렬 작업 실행 계획 수립

- 19건 항목의 파일 충돌 분석 → 4단계 배치(A~J 10세션)로 분류
- Batch 1: 5세션 병렬 (테스트, WS정비, 라이프사이클, 설정/보안, 빌드정리)
- Batch 2: 2세션 (타입 시스템 대개편, DOM 셀렉터 통합)
- Batch 3: 2세션 (에러/로깅 통일, 상태 동기화)
- Batch 4: 1세션 (Import alias 전체 통일)
- 각 세션별 프롬프트 작성 완료

## (2026-02-06) 심층 아키텍처 분석 (2차)

- 6개 영역 26건 추가 분석 → findings.md에 S0~S2 (항목 11~19) 기록
- CRITICAL 발견:
  - ExtensionMessage가 discriminated union이 아님 → 모든 핸들러에서 unsafe cast
  - Background↔Content Script 상태 동기화 메커니즘 없음 → 레이스 컨디션
- HIGH 발견:
  - websocket-interceptor의 이벤트 리스너가 실제로 제거되지 않는 버그
  - 텔레그램 봇 토큰 평문 저장, WS 데이터 무검증 전달

## (2026-02-06) 레거시 모듈 삭제 + 아키텍처 리뷰

- `src/sidepanel/`, `src/content/`, `src/database/` 3개 레거시 디렉토리 삭제
  - manifest.json에서 참조 없음 확인, 다른 모듈에서 import 없음 확인
- CLAUDE.md에서 레거시 모듈 섹션 제거
- 코드 리뷰 기반 아키텍처 개선 과제 10건 도출 → `docs/head/findings.md` 기록
  - P0: any 타입 제거, 셀렉터 중복 제거, 핵심 모듈 테스트
  - P1: 에러 핸들링 일관성, Config 통합, WS 순환 의존, import alias 통일
  - P2: 로깅 마이그레이션, barrel export, 레이어 경계 정리

## 📊 전체 진행률

```
[███████████████░░░░░] 75%
```

## 🎉 52.1% 목표 달성!

**합성 데이터 백테스트 결과 (2026-02-01):**

| 전략 | 거래수 | 승률 | Profit Factor |
|------|--------|------|---------------|
| **RSI+BB** | 41 | **56.1%** ✅ | 1.18 |
| **EMA Pullback** | 33 | **54.5%** ✅ | 1.10 |
| RSI+MACD | 1 | 100.0% | 0.00 |
| ADX+RSI | 2 | 100.0% | 0.00 |
| Vote(2) | 2 | 100.0% | 0.00 |
| Vote(3) | 1 | 100.0% | 0.00 |

> ⚠️ 실제 데이터 검증 필요 (Binance API 네트워크 이슈로 대기 중)

## ✅ 완료된 모듈

### 1. 프로젝트 기반 (100%)
- [x] TypeScript + Vite 설정
- [x] Chrome Extension manifest v3
- [x] 테스트 환경 (Vitest)
- [x] Tailwind CSS 스타일링

### 2. 타입 시스템 (100%)
- [x] 핵심 타입 정의
- [x] DOM 셀렉터 타입
- [x] 데모 모드 감지 함수

### 3. 인디케이터 라이브러리 (100%)
- [x] RSI
- [x] SMA / EMA
- [x] Bollinger Bands
- [x] MACD
- [x] Stochastic
- [x] Triple Stochastic

### 4. 백테스트 엔진 (90%)
- [x] 코어 엔진
- [x] 전략 등록 시스템
- [x] 결과 분석 (승률, 드로다운, 수익률)
- [x] 파라미터 최적화
- [x] 테스트 데이터 생성기
- [ ] 실제 히스토리컬 데이터 연동

### 5. RSI 전략 (100%)
- [x] RSI 과매수/과매도
- [x] RSI 다이버전스
- [x] RSI + 볼린저밴드
- [x] RSI + 스토캐스틱
- [x] RSI 추세 추종

### 6. 콘텐츠 스크립트 (85%)
- [x] DOM 셀렉터 발견
- [x] 데모 모드 감지
- [x] 데이터 수집기 (기본)
- [x] 거래 실행기
- [x] 페이아웃 모니터
- [x] 페이지 인디케이터 값 읽기 (indicator-reader.ts)
- [ ] 실시간 가격 수집 개선

### 6.1 고승률 전략 모듈 (100% ✅)
- [x] RSI + MACD 조합 전략
- [x] RSI + Bollinger Bands 바운스 전략 → **56.1% 달성** 🏆
- [x] RSI 극단값 반전 전략
- [x] Triple Confirmation (RSI + Stoch + MACD)
- [x] EMA Trend + RSI Pullback → **54.5% 달성** 🏆
- [x] Vote 시스템 (다중 전략 합의)
- [x] ZMR-60 (Z-score Mean Reversion) 전략 + SignalGeneratorV2 이중 확인 통합
- [x] 합성 데이터로 52.1%+ 검증 완료
- [ ] 실제 데이터로 Forward Test 검증

### 7. 사이드 패널 UI (80%)
- [x] 상태 카드
- [x] 컨트롤 패널
- [x] 로그 뷰어
- [ ] 백테스트 결과 표시
- [ ] 전략 설정 UI

### 8. 백그라운드 서비스 (50%)
- [x] 메시지 라우팅
- [ ] 상태 관리
- [ ] 알림 시스템

### 9. RAG 시스템 (40%)
- [x] 문서 저장 구조
- [x] 검색 기능
- [x] 조건 추출 유틸
- [ ] YouTube 자막 추출
- [ ] AI 전략 분석

## 🔄 진행 중인 작업

### PO-11: 실시간 데이터 수집 개선 (진행중 ✅)
- Forward Test V2 업그레이드 완료 (Stochastic 제거)
- RSI V2 + EMA Cross V2 전략만 사용
- IndicatorReader 테스트 24개 추가 및 통과
- 실전 Forward Test 대기 중

### 52.1%+ 승률 전략 탐색 (완료 ✅)
- 고승률 전략 모듈 구현 완료 (high-winrate.ts)
- 5가지 다중 확인 전략 구현
- Vote 시스템으로 신뢰도 향상
- **합성 데이터 백테스트 완료: RSI+BB 56.1%, EMA Pullback 54.5%**
- V1 Forward Test 결과: RSI 62.5%, Stochastic 31.6% (제거)

### 실시간 데이터 수집
- CandleCollector로 DOM 가격 수집 중
- IndicatorReader로 페이지 인디케이터 읽기 구현

## ⏳ 대기 중인 작업

1. ~~실제 히스토리컬 데이터로 백테스트~~ → 네트워크 이슈로 대기
2. Forward Test로 실전 검증 (우선순위 상승)
3. 52.1%+ 전략 파라미터 미세 조정
4. 자동매매 고도화

## 🐛 알려진 이슈

| ID | 심각도 | 설명 | 상태 |
|----|--------|------|------|
| #1 | 🔴 High | RSI 계산용 실시간 가격 없음 | 조사 중 |
| #2 | 🟡 Med | 거래 결과 자동 추적 미구현 | 대기 |
| #3 | 🟢 Low | 차트 에러 메시지 표시 | 무시 가능 |

## 📈 테스트 현황

```
Test Suites: 22 total (18 passed, 4 failed - network issues)
Tests: 168 total (155 passed, 13 failed - Binance API)
High Win-Rate Tests: 10 passed ✅
```

## 🎯 다음 마일스톤

**M0: 52.1% 승률 달성 (완료 ✅)**
- [x] 고승률 전략 모듈 구현
- [x] 합성 데이터로 백테스트 완료
- [x] 52.1%+ 달성 전략 확정: RSI+BB (56.1%), EMA Pullback (54.5%)
- [ ] Forward Test 검증

**M1: 실시간 데이터 (진행중)**
- [x] 가격 데이터 수집 (CandleCollector)
- [x] 페이지 인디케이터 읽기 (IndicatorReader)
- [ ] 신호 정확도 검증 → Forward Test와 병행

**M2: 안정적인 데모 트레이딩**
- [ ] 10회 이상 자동 거래
- [ ] 승률 52%+ 달성
- [ ] 결과 로깅
