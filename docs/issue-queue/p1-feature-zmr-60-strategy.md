---
type: feature
title: "ZMR-60 (Z-score Mean Reversion, 60초 만기) 전략 추가"
labels: ["enhancement", "feat"]
priority: p1
related_files:
  - src/lib/backtest/strategies/zmr-60.ts
  - src/lib/signals/signal-generator-v2.ts
  - src/lib/backtest/strategies/index.ts
created_by: cloud-llm
created_at: "2026-02-13"
---

## 목표

1분 로그수익률 Z-score 기반 평균회귀 전략(ZMR-60)을 구현하여 60초 만기 바이너리 옵션에서 52.1%+ 승률을 달성한다.

## 배경 / 이론적 근거

- **초단기 리버설(되돌림)**: 일시적 유동성 불균형과 bid-ask bounce(미시구조 요인)으로 설명됨
  - Heston, Korajczyk, Sadka (2010): 나스닥100 나노초 데이터 기반, 극단 1분 음봉 이후 되돌림 관측
- **OIB-reversal**: 오더 불균형 조건부 수익률 음의 자기상관
  - Rif, Utz (2021): Order Imbalance → Reversal 패턴
- **변동성 군집/순환**: 밴드폭 수축(스퀴즈) 후 확대(브레이크아웃) 패턴

## 요구사항

### 전략 핵심 로직
1. 1분 로그수익률 r_t = ln(close_t / close_{t-1}) 계산
2. lookbackReturns(기본 60) 구간 평균/표준편차(μ, σ) 산출
3. z = (r_last - μ) / σ 표준화
4. 트리거: z <= -2.5 → CALL 후보, z >= +2.5 → PUT 후보

### 다중 확인 필터 (confirmMin=2/3)
- RSI(7): CALL은 RSI<25, PUT은 RSI>75
- Bollinger Bands(20,2): CALL은 bbPosition<0.10, PUT은 bbPosition>0.90
- Candle rejection(윅): CALL은 lowerWickRatio>=0.45, PUT은 upperWickRatio>=0.45

### 통합
- SignalGeneratorV2의 ranging(ADX<25) 구간에서 rsiBBBounce + ZMR-60 이중 확인
- config 옵션: 'consensus'(동일 방향만), 'best'(높은 confidence만)

## 기술 스택

- TypeScript (strict mode)
- Vitest (테스트)
- 기존 indicators 라이브러리 (RSI, BollingerBands)

## 완료 조건

- [x] zmr-60.ts 전략 모듈 구현
- [x] SignalGeneratorV2 통합 (config 옵션 포함)
- [x] strategies/index.ts에서 export
- [x] 단위 테스트 (CALL/PUT 신호 생성 + 필터링 케이스)
- [x] 3-file-pattern 문서화
- [x] 테스트 통과
