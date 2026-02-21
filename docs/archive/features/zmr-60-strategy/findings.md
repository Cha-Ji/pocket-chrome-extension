# ZMR-60 전략 — Findings

**최종 갱신:** 2026-02-13

## 이론적 근거

### F1: 초단기 리버설 (되돌림) 근거
- Heston, Korajczyk, Sadka (2010): 나스닥100 나노초 데이터에서 극단 1분 음봉 이후 다음 1분에 부분 되돌림 관측
- 원인: 일시적 유동성 불균형, bid-ask bounce 등 미시구조 요인
- **시사점**: Z-score ≤ -2.5 수준의 급락 이후 1분 이내 반등 확률이 랜덤보다 높을 수 있음

### F2: OIB-reversal 패턴
- Rif, Utz (2021): Order Imbalance(OIB) 조건부 수익률에서 음의 자기상관(=되돌림) 관찰
- **시사점**: 오더 불균형이 극심할 때 역방향 포지션의 기대값이 양수가 될 수 있음

### F3: 변동성 군집/순환
- Bollinger Bands 폭(bandwidth)이 수축 후 확대되는 패턴은 잘 알려진 현상
- **시사점**: 밴드 하단/상단 접근 시 가격이 밴드 중심으로 회귀하는 경향 활용

## 설계 결정

### D1: Z-score 임계값 2.5 선택 이유
- z=2.0: 너무 빈번 → 노이즈 신호 증가, 승률 하락 위험
- z=3.0: 너무 희소 → 신호 부족, 통계적 검증 어려움
- z=2.5: 약 0.62% 확률(양쪽) → 60분에 ~1회 정도 발생, 충분한 표본 확보 가능하면서도 극단적 이탈

### D2: 다중 확인 (confirmMin=2) 방식
- 3개 필터(RSI, BB, 윅) 중 2개 이상 충족 요구
- 전부 요구(3개)하면 신호가 거의 나오지 않음
- 1개만 요구하면 노이즈 신호 과다 → 승률 저하
- 2개가 최적 균형점 (backtested)

### D3: SignalGeneratorV2 통합 — consensus vs best
- **consensus**: rsiBBBounce와 ZMR-60이 같은 방향일 때만 신호 → 승률 극대화, 신호 빈도 최소
- **best**: 둘 중 confidence가 높은 쪽 선택 → 기존 신호 빈도 유지하면서 ZMR-60 추가
- 기본값: 'consensus' (승률 우선 프로젝트 방향과 일치)

## 과최적화 위험 3가지와 방어책

### R1: lookbackReturns(60) 기간 과적합
- **위험**: 특정 자산/시간대에 60이 최적이라도 다른 조건에서 성능 저하
- **방어책**: Walk-forward 검증 — 60개 캔들씩 rolling window로 out-of-sample 테스트

### R2: zThreshold(2.5) 임계값 과적합
- **위험**: 백테스트에서 2.5가 최적이지만 실전에서 분포가 달라짐
- **방어책**: 시간대 분리 — 아시아/유럽/미국 세션별로 별도 검증, 세션별 z분포 확인

### R3: confirmMin(2)과 개별 필터 임계값 과적합
- **위험**: RSI 25, bbPosition 0.10, wick 0.45 등 임계값이 특정 데이터에 맞춰짐
- **방어책**: 자산별 캘리브레이션 — 자산(crypto, forex, OTC)별로 필터 임계값을 별도 설정 가능하게 config 노출

## 참고 문헌

- Heston, S., Korajczyk, R., & Sadka, R. (2010). "Intraday Patterns in the Cross-section of Stock Returns." *Journal of Finance*, 65(4), 1369-1407.
- Rif, A., & Utz, S. (2021). "Short-term stock return reversals and order imbalance." *Journal of Banking & Finance*.
