# TIF-60 (Tick Imbalance Fade) 전략 — Task Plan

**이슈**: p1-feature-tif-60-tick-imbalance-fade (issue-queue)
**브랜치**: `claude/tif-60-strategy-V8eNC`
**목표**: 승률 52.1%+ 틱 불균형 역추세 전략

---

## Phase 1: 코어 전략 구현

- [x] `src/content-script/tick-strategies.ts` 생성
  - [x] `TIF60Config` 인터페이스 정의
  - [x] `tickImbalanceFadeStrategy(ticks, candles?, cfg?)` 구현
  - [x] `StrategyResult` 호환 반환값
  - [x] imbalance 계산 (up/down tick count proxy)
  - [x] exhaustion 필터 (deltaZ + stall detection)
  - [x] confidence 계산 (imbalanceAbs + deltaZ 기반)

## Phase 2: 통합

- [x] `src/content-script/index.ts` 수정
  - [x] `setupCandleHandler`에서 TIF-60 호출
  - [x] getTickHistory()로 틱 확보 → 윈도우 필터
  - [x] SignalGeneratorV2 결과와 방향 합의 옵션

## Phase 3: 테스트

- [x] `src/content-script/tick-strategies.test.ts` 작성
  - [x] imbalance+stall 케이스 → 신호 발생
  - [x] minTicks 미만 → 무신호
  - [x] imbalance 미만 → 무신호
  - [x] 방향 검증 (매수 쏠림 → PUT, 매도 쏠림 → CALL)

## Phase 4: 문서화

- [x] 3-file-pattern 문서 (task_plan, findings, progress)
- [x] issue-queue 이슈 파일
- [x] head/progress.md 업데이트
