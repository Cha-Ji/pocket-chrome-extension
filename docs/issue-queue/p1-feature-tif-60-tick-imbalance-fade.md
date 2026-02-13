---
type: feature
title: "TIF-60 (Tick Imbalance Fade, 60초) 전략 구현"
labels: ["feat", "p1"]
priority: p1
related_files:
  - src/content-script/tick-strategies.ts
  - src/content-script/index.ts
  - src/content-script/candle-collector.ts
  - src/lib/signals/signal-generator-v2.ts
  - src/lib/backtest/strategies/high-winrate.ts
created_by: cloud-llm
created_at: "2026-02-13"
---

## 목표

Tick Imbalance Fade (TIF-60) 전략 구현 — 초단기 틱 불균형 기반 역추세(되돌림) 매매.
최우선 목표는 승률 52.1%+이며 신호 빈도는 낮아도 됨.

## 근거 (문헌)

- **초단기 리버설(되돌림)**: 일시적 유동성 불균형과 bid-ask bounce 같은 미시구조 요인 (Heston et al., 2010)
- **OIB-reversal**: Order Imbalance 조건부 수익률 음의 자기상관 (Sirnes 2021, Chordia et al. 2002)
- **변동성 군집**: 밴드폭 수축(스퀴즈) 뒤 확대(브레이크아웃) 패턴

## 전략 정의

1. **입력**: 최근 ticks (timestamp, price, ticker) + 최근 candles (선택적)
2. **윈도우**: 최근 windowSec (기본 20초) 구간의 해당 ticker ticks만 필터
3. **최소 틱**: minTicks (기본 80) 미만이면 신호 금지 (유동성 부족 → 노이즈)
4. **Imbalance 계산** (업틱/다운틱 proxy):
   - up = count(price_i > price_{i-1})
   - down = count(price_i < price_{i-1})
   - imbalance = (up - down) / (up + down)
5. **과열 + 소진(exhaustion) 필터** (승률 우선):
   - imbalanceAbs >= imbalanceThreshold (기본 0.65)
   - delta = lastPrice - firstPrice (가격변화)
   - delta가 너무 작으면 신호 금지
   - deltaZ >= 2.0 (candle-returns std로 표준화) AND 마지막 stallLookbackTicks (기본 10틱)에서 반대방향 틱 증가(모멘텀 둔화) 시에만 진입
6. **진입 방향**:
   - imbalance > +thr (매수 쏠림) → PUT (되돌림)
   - imbalance < -thr (매도 쏠림) → CALL
7. **Confidence**: 기본 0.60, imbalanceAbs/deltaZ에 비례 가산 (상한 0.90)

## 요구사항

- `src/content-script/tick-strategies.ts` 신규 파일 작성
- `tickImbalanceFadeStrategy(ticks, candles?, cfg?)` → `StrategyResult` 호환
- content-script/index.ts에서 candleCollector.onCandle 핸들러에 통합
- SignalGeneratorV2 결과와 "방향 합의" 옵션 제공
- 테스트: 인위적 tick 시퀀스로 검증

## 파라미터 기본값

| 파라미터 | 기본값 | 설명 |
|---------|--------|------|
| windowSec | 20 | 분석 윈도우 (초) |
| minTicks | 80 | 최소 틱 수 |
| imbalanceThreshold | 0.65 | 불균형 임계값 |
| deltaZThreshold | 2.0 | 표준화 가격변화 임계값 |
| stallLookbackTicks | 10 | 모멘텀 둔화 감지 구간 |
| minDeltaAbs | 0 | 최소 절대 가격변화 (자동 계산) |
| baseConfidence | 0.60 | 기본 신뢰도 |
| maxConfidence | 0.90 | 최대 신뢰도 |

## 실전 리스크 포인트

1. **틱 밀도 급감**: 시장 비활성 시간대에 minTicks 도달 불가 → 신호 0 (의도된 방어)
2. **연결 지연**: WebSocket 끊김/지연 시 틱 타임스탬프 왜곡 → 윈도우 필터에서 자동 배제
3. **자산별 최소틱 재튜닝**: OTC 자산은 틱 빈도 차이 큼 → 자산별 minTicks 오버라이드 필요

## 완료 조건

- [x] tick-strategies.ts 구현
- [x] content-script/index.ts 통합
- [x] 테스트 (imbalance+stall → 신호, minTicks 미만 → 무신호, imbalance 미만 → 무신호)
- [x] 3-file-pattern 문서화
- [x] 파라미터 기본값 테이블
- [x] 실전 리스크 포인트 3가지 + 방어 기술
