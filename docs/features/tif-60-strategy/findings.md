# TIF-60 Findings

## F1: 이론적 근거

- **OIB-reversal**: Order Imbalance 조건부 수익률 되돌림 (Sirnes 2021, Chordia et al. 2002)
- **초단기 리버설**: 유동성 불균형 + bid-ask bounce (Heston et al. 2010)
- **변동성 군집**: 밴드폭 수축 뒤 확대 (브레이크아웃) 패턴
- 핵심: 극단적 틱 쏠림(imbalance) 후 모멘텀 둔화(stall) 시 되돌림 확률 상승

## F2: 기존 구조 분석

- `CandleCollector.getTickHistory()`: TickData[] 반환 (max 10,000), `{price, timestamp, ticker}`
- `StrategyResult`: `{signal: 'CALL'|'PUT'|null, confidence, reason, indicators}` — high-winrate.ts 참조
- `setupCandleHandler`: candleCollector.onCandle → signalGenerator.addCandle → handleNewSignal 체인
- 통합 포인트: onCandle 콜백에서 getTickHistory() 호출 후 TIF-60 평가

## F3: 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 파일 위치 | content-script/tick-strategies.ts | 틱 데이터에 가장 가까운 레이어 |
| 반환 타입 | StrategyResult (high-winrate.ts) | 기존 파이프라인 호환 |
| 통합 방식 | onCandle에서 독립 평가 | SignalGeneratorV2 내부 수정 최소화 |
| 방향 합의 | 옵션 (requireConsensus flag) | 단독/합의 모드 선택 가능 |
| deltaZ 표준화 | candle close returns std | 자산별 변동성 자동 보정 |

## F4: 실전 리스크 & 방어

1. **틱 밀도 급감** (시장 비활성): minTicks 필터로 자연 방어, 자산별 오버라이드 지원
2. **연결 지연** (WS 끊김): 타임스탬프 기반 윈도우 필터로 오래된 틱 자동 배제
3. **자산별 특성 차이**: OTC 자산 틱 빈도 상이 → config 오버라이드 인터페이스 제공
