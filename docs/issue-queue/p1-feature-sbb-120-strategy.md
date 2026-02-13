---
type: feature
title: "SBB-120 (Squeeze Bollinger Breakout 120초) 전략 구현"
labels: ["enhancement", "strategy"]
priority: p1
related_files:
  - src/lib/backtest/strategies/sbb-120.ts
  - src/lib/backtest/strategies/high-winrate.ts
  - src/lib/backtest/strategies/index.ts
  - src/lib/backtest/strategies/bollinger-strategy.ts
  - src/lib/signals/signal-generator-v2.ts
  - src/lib/signals/types.ts
  - src/lib/indicators/index.ts
created_by: cloud-llm
created_at: "2026-02-13"
---

## 목표

Bollinger BandWidth squeeze(수축) 감지 후 breakout(이탈) 방향으로 120초 만기 거래하는 SBB-120 전략 구현.
최우선 목표: 승률 52.1%+, 신호 빈도는 낮아도 됨.

**근거(문헌)**:
- Bollinger BandWidth와 Squeeze: StockCharts ChartSchool — "BandWidth가 역사적 저점이면 큰 움직임 임박, 이후 밴드 이탈이 방향 신호"
- Bollinger Method I (Volatility Breakout / The Squeeze)
- 초단기 리버설: 오더 불균형(OIB) 조건부 수익률 음의 자기상관(=되돌림) 관찰
- 변동성 군집/순환: 밴드폭 수축(스퀴즈) → 확대(브레이크아웃)

## 요구사항

### 전략 정의

1. **입력**: 1분 candles (최소 200개 권장)
2. **Bollinger Bands**: bbPeriod=20, k=2, bandwidth = (upper - lower) / mid
3. **Squeeze 판정**: lookbackSqueeze=120 구간에서 bandwidth 하위 10% 퍼센타일 → squeeze=true
4. **Breakout 트리거**: squeeze 상태에서 close > upper + margin → CALL, close < lower - margin → PUT
5. **breakoutMargin**: 0.05 * (upper - lower) — 가짜돌파 억제
6. **추가 필터**:
   - bodyRatio >= 0.55 (몸통이 캔들 범위에서 충분히 큼)
   - 최근 5캔들 대비 변동성(range) 증가 확인
7. **만기**: expiryOverride = 120초
8. **confidence**: 기본 0.60, bandwidth 극단성 + breakoutMargin 초과폭 + bodyRatio에 따라 가산 (상한 0.90)

### 통합 요구사항

- StrategyResult 타입에 `expiryOverride?: number` 추가 (하위호환)
- SignalGeneratorV2.createSignal에서 expiryOverride 우선 적용
- selectStrategy에서 ranging 구간에 SBB-120 우선 적용
- 백테스트 strategies에 등록

## 기술 스택

- 기존 indicators: `BollingerBands.calculate()`, `SMA`, `ATR` (from `src/lib/indicators/`)
- TypeScript, Vitest

## 완료 조건

- [ ] `src/lib/backtest/strategies/sbb-120.ts` 생성
- [ ] `StrategyResult`에 `expiryOverride?: number` 추가
- [ ] `SignalGeneratorV2.createSignal`에서 expiryOverride 반영
- [ ] `selectStrategy`에서 SBB-120 통합
- [ ] `strategies/index.ts`에서 export
- [ ] 테스트: bandwidth 저점 → upper 돌파 시 CALL
- [ ] 테스트: 돌파폭 margin 미만 → 신호 없음
- [ ] 테스트: expiryOverride가 Signal.expiry에 반영
- [ ] 가짜돌파 방어 로직 3개 (margin, bodyRatio, volatility expansion)
- [ ] docs 3-file-pattern 문서화
