# Findings - Forward Test 분석 (PO-13)

## 📅 2026-02-01

### Forward Test V1 결과 요약

| 항목 | 값 |
|------|-----|
| 테스트 시간 | 60분 |
| 총 거래 | 35 |
| 승/패 | 14/21 |
| 승률 | **40.0%** |
| 순손실 | -$79.51 |
| 최종 잔액 | $920.49 |

### 전략별 성과 (초기 분석)

| 전략 | 거래수 | 예상 문제점 |
|------|--------|------------|
| Stochastic (14/3) | 다수 | 역추세 신호 과다 |
| RSI (14) 35/65 | 중간 | 임계값 조정 필요 |
| EMA Cross (5/13) | 중간 | 지연 신호 |

### 시장 레짐별 분석

- **ranging**: 초기 성과 양호
- **weak_uptrend**: 과다한 PUT 신호 (역추세)
- **strong_uptrend**: PUT 신호가 손실 유발

### 핵심 문제점

1. **역추세 신호**: 상승 추세에서 PUT 신호 과다 발생
2. **레짐 필터링 부재**: 시장 상황에 맞지 않는 신호 생성
3. **전략 선택 로직**: 고승률 전략(high-winrate.ts) 미사용

---

## 개선 사항 (V2 신호 생성기)

### 구현된 기능

1. **시장 레짐별 전략 선택**
   - `strong_uptrend/downtrend`: EMA Trend + RSI Pullback
   - `weak_uptrend/downtrend`: Triple Confirmation → EMA Pullback
   - `ranging`: RSI + BB Bounce → Vote

2. **추세 필터링**
   - 강한 추세: 추세 방향 신호만 허용
   - 약한 추세: ADX 30+ 시 추세 방향만
   - 횡보: 모든 방향 허용

3. **신뢰도 필터링**
   - 최소 신뢰도: 60%
   - Vote 전략: 최소 2개 전략 일치

### 새로운 파일

- `src/lib/signals/signal-generator-v2.ts`: 개선된 신호 생성기
- `scripts/forward-test-v2.ts`: V2 Forward Test 스크립트

### 기대 효과

- 역추세 신호 필터링으로 손실 감소
- 고승률 전략 적용으로 승률 향상
- 신뢰도 기반 필터링으로 저품질 신호 제거
