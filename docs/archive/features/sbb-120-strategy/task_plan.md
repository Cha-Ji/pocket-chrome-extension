# SBB-120 Strategy — Task Plan

## 목표
Squeeze Bollinger Breakout 120초 전략 구현. 승률 52.1%+ 최우선.

## 체크리스트

### Phase 1: 타입 확장
- [x] `StrategyResult`에 `expiryOverride?: number` 추가 (하위호환)

### Phase 2: 전략 구현
- [x] `src/lib/backtest/strategies/sbb-120.ts` 생성
  - [x] Bandwidth 계산 (BB period=20, k=2)
  - [x] Squeeze 판정 (lookback=120, 하위 10% 퍼센타일)
  - [x] Breakout 트리거 (close > upper + margin → CALL)
  - [x] 가짜돌파 방어 #1: breakoutMargin (0.05 * bandRange)
  - [x] 가짜돌파 방어 #2: bodyRatio >= 0.55
  - [x] 가짜돌파 방어 #3: volatility expansion (최근 5캔들 대비)
  - [x] Confidence 계산 (0.60~0.90)
  - [x] expiryOverride = 120
- [x] `strategies/index.ts`에서 export

### Phase 3: SignalGeneratorV2 통합
- [x] `createSignal`에서 expiryOverride 우선 적용
- [x] `selectStrategy`에서 SBB-120 통합 (ranging 구간 우선)
- [x] `sbb120Strategy` 함수를 high-winrate 패턴으로 추가

### Phase 4: 테스트
- [x] bandwidth 저점 → upper 돌파 시 CALL 생성
- [x] lower 돌파 시 PUT 생성
- [x] 돌파폭 margin 미만 → 신호 없음
- [x] bodyRatio < 0.55 → 신호 없음
- [x] squeeze 아닐 때 → 신호 없음
- [x] expiryOverride가 Signal.expiry에 반영
- [x] 데이터 부족 시 null 반환

### Phase 5: 문서화
- [x] 3-file pattern 완성
- [x] head/progress.md 업데이트
- [x] 커밋 & 푸시

## 파라미터 기본값 표

| 파라미터 | 기본값 | 범위 | 설명 |
|---------|--------|------|------|
| bbPeriod | 20 | 10-30 | Bollinger Band 기간 |
| bbStdDev | 2.0 | 1.5-3.0 | 표준편차 배수 |
| lookbackSqueeze | 120 | 60-200 | Squeeze 판정 룩백 |
| squeezePercentile | 10 | 5-20 | BW 하위 % 기준 |
| breakoutMarginRatio | 0.05 | 0.02-0.10 | 밴드폭 대비 margin |
| minBodyRatio | 0.55 | 0.40-0.70 | 최소 몸통 비율 |
| volExpansionRatio | 1.2 | 1.0-1.5 | 변동성 확장 비율 |
| expiryOverride | 120 | - | 만기 초 |
