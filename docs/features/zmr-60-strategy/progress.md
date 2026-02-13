# ZMR-60 전략 — Progress

**최종 갱신:** 2026-02-13

## (2026-02-13) ZMR-60 전략 구현 및 SignalGeneratorV2 통합

- **구현 완료**:
  - `src/lib/backtest/strategies/zmr-60.ts` — 전략 모듈
  - `src/lib/signals/signal-generator-v2.ts` — selectStrategy 이중 확인 통합
  - `src/lib/backtest/strategies/index.ts` — export 추가
  - `src/lib/backtest/strategies/zmr-60.test.ts` — 단위 테스트
- **통합 방식**: consensus(기본) / best / off 옵션
- **다음 행동**: 실환경 데이터로 forward test, walk-forward 검증
