# SBB-120 Strategy — Findings

## F1: 이론적 근거

### Bollinger BandWidth Squeeze
- StockCharts ChartSchool: "BandWidth가 역사적 저점이면 큰 움직임 임박"
- Bollinger Method I (Volatility Breakout): squeeze 후 밴드 이탈이 방향 신호
- 변동성은 군집/순환 성격 → 수축(squeeze) 뒤 확대(breakout)가 자주 관측

### 초단기 리버설
- 극단적 1분 음봉(급락) 이후 다음 1분에 일부 되돌림 관측 (나스닥100 연구)
- OIB-reversal: 오더 불균형 조건부 수익률 음의 자기상관

## F2: selectStrategy 배치 결정

**결정**: ranging 구간에서 SBB-120을 우선 적용, rsiBBBounce를 폴백으로 유지.

**이유**:
- Squeeze는 본질적으로 횡보(ranging) 구간에서 발생하는 현상
- ADX < 25인 구간에서 BandWidth가 수축하는 것은 자연스러운 시장 상태
- Breakout은 ranging → trending 전환을 포착하는 것이 목적
- 기존 rsiBBBounce (56.1%)와 SBB-120은 상호보완적:
  - rsiBBBounce = 밴드 안에서 반전
  - SBB-120 = 밴드 밖으로 돌파
- 조건이 맞을 때만 SBB-120 발동, 아니면 rsiBBBounce 폴백

## F3: 가짜돌파 방어 로직 3가지

1. **breakoutMargin**: `0.05 * (upper - lower)` 이상 벗어나야 인정
   - 단순 터치가 아닌 유의미한 돌파만 거래
2. **bodyRatio**: `abs(close - open) / (high - low) >= 0.55`
   - 몸통이 충분히 큰 캔들만 = 확신 있는 움직임
3. **volatility expansion**: 현재 캔들 range > 최근 5캔들 평균 range * 1.2
   - 실제 변동성 증가 확인 = squeeze 탈출 확인

## F4: expiryOverride 설계

- `StrategyResult`에 optional `expiryOverride?: number` 추가
- 기존 전략은 이 필드를 설정하지 않으므로 하위호환 보장
- `SignalGeneratorV2.createSignal`에서 `strategyResult.expiryOverride ?? this.config.expirySeconds` 사용
- SBB-120은 120초 만기를 기본으로 제안 (전략 특성상 breakout momentum 필요)
