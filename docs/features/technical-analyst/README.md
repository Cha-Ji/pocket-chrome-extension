# Technical Analyst 기능

**역할**: 기술적 지표 계산 및 시각화

## 핵심 설계
- 우선 지원 지표: RSI, 볼린저밴드, 이동평균 (SMA/EMA)
- 추가 구현: MACD, Stochastic
- `technicalindicators` 대신 자체 구현 (번들 크기 최적화)

## 상태
- 지표 라이브러리 구현 완료 (`src/lib/indicators/`)
- 차트 오버레이 렌더링 미구현

## 관련 소스
- `src/lib/indicators/index.ts` (지표 계산)
- `src/lib/backtest/strategies/` (전략별 지표 활용)
