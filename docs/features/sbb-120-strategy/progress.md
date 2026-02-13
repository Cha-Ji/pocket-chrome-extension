# SBB-120 Strategy — Progress

## (2026-02-13) 전략 구현 완료

- 이슈 큐 등록: `docs/issue-queue/p1-feature-sbb-120-strategy.md`
- 3-file 문서 생성
- `StrategyResult`에 `expiryOverride?: number` 추가 (하위호환)
- `src/lib/backtest/strategies/sbb-120.ts` 구현 완료
  - Bandwidth squeeze 판정 (lookback=120, 하위 10% 퍼센타일)
  - Breakout 트리거 (close > upper + margin)
  - 가짜돌파 방어: breakoutMargin, bodyRatio, volatility expansion
  - Confidence 0.60~0.90 가변 계산
  - expiryOverride = 120
- `strategies/index.ts`에서 export 추가
- `SignalGeneratorV2` 통합:
  - import sbb120Strategy
  - `selectStrategy`: ranging에서 SBB-120 우선, rsiBBBounce 폴백
  - `createSignal`: expiryOverride 우선 적용
- 테스트 17개 작성 및 통과
  - 기존 전략 테스트 125개 모두 통과 (하위호환 확인)
- 다음 행동: 실데이터 백테스트로 승률 검증
