# ZMR-60 전략 구현 — Task Plan

**상태:** 진행중
**생성일:** 2026-02-13
**관련 이슈:** (issue-queue: p1-feature-zmr-60-strategy.md)

## 개요

Z-score Mean Reversion (60초 만기) 전략을 구현하여 횡보장(ADX<25)에서
기존 RSI+BB 전략과 이중 확인 시스템으로 52.1%+ 승률을 달성한다.

## 체크리스트

### 1. 전략 모듈 구현
- [x] `src/lib/backtest/strategies/zmr-60.ts` 생성
  - [x] ZMR60Config 인터페이스 정의
  - [x] 로그수익률 계산 함수
  - [x] Z-score 계산 로직
  - [x] RSI 확인 필터
  - [x] Bollinger Bands 위치 확인 필터
  - [x] Candle rejection(윅) 확인 필터
  - [x] confirmMin 다중 확인 로직
  - [x] confidence 산정 로직
  - [x] StrategyResult 반환 형태

### 2. SignalGeneratorV2 통합
- [x] `zmr60MergeMode` config 추가 ('consensus' | 'best' | 'off')
- [x] selectStrategy에서 ranging 구간 이중 전략 실행
- [x] consensus 모드: 동일 방향일 때만 신호
- [x] best 모드: 높은 confidence 선택

### 3. Export / 타입
- [x] `strategies/index.ts`에 ZMR-60 export 추가
- [x] StrategyName 타입에 'zmr-60' 추가

### 4. 테스트
- [x] zmr-60.test.ts 생성
- [x] 급락 + 하단밴드 + RSI 과매도 + 윅 → CALL 케이스
- [x] 급등 + 상단밴드 + RSI 과매수 + 윅 → PUT 케이스
- [x] 조건 1개만 충족 → null 케이스
- [x] 데이터 부족 → null 케이스
- [x] confidence 범위 검증

### 5. 문서화
- [x] 3-file-pattern: task_plan.md, findings.md, progress.md
- [x] head/progress.md 갱신
- [x] 파라미터 기본값 표
- [x] 과최적화 위험 3가지 + 방어책

## 파라미터 기본값 표

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| lookbackReturns | 60 | 수익률 통계 산출 lookback 구간 (캔들 수) |
| zThreshold | 2.5 | Z-score 트리거 임계값 |
| rsiPeriod | 7 | RSI 계산 기간 |
| rsiOversold | 25 | RSI 과매도 임계값 |
| rsiOverbought | 75 | RSI 과매수 임계값 |
| bbPeriod | 20 | Bollinger Bands 기간 |
| bbStdDev | 2 | Bollinger Bands 표준편차 배수 |
| bbCallThreshold | 0.10 | CALL 조건: bbPosition 상한 |
| bbPutThreshold | 0.90 | PUT 조건: bbPosition 하한 |
| wickThreshold | 0.45 | 캔들 윅 비율 임계값 |
| confirmMin | 2 | 최소 확인 조건 수 (3개 중) |
| minCandles | 80 | 최소 캔들 데이터 수 |
