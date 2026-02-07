# Backtester & Logger 기능

**역할**: 백테스팅과 거래 로그 통합 관리

## 핵심 설계
- 과거 데이터 기반 전략 리플레이 → 승률 계산
- CSV 내보내기 및 수익 곡선 리포트
- 파라미터 최적화 (그리드 서치)

## 상태
- 백테스트 엔진 구현 완료
- 파라미터 최적화 구현 완료
- CSV 내보내기 미구현

## 제약사항
- 대량 데이터 재생 시 성능 고려 필요

## 관련 소스
- `src/lib/backtest/engine.ts` (백테스트 엔진)
- `src/lib/backtest/optimizer.ts` (파라미터 최적화)
- `src/lib/backtest/statistics.ts` (통계 계산)
- `src/lib/backtest/strategies/` (전략 구현체)
