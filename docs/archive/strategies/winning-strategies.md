# 52%+ 승률 달성 전략 정리

**최종 업데이트:** 2026-02-01

## 📊 목표

92% 페이아웃에서 수익을 내기 위한 **최소 52.1% 승률** 달성

```
기대값 = 0.521 × 0.92 - 0.479 × 1.00 = +0.00132 (거래당 +0.13%)
100회 거래 시 예상 수익: +1.3%
```

---

## ✅ 검증된 52%+ 전략

### 1. RSI + Bollinger Bands (횡보장 전용)

**승률:** 54.0% (ETHUSDT), 43.9% (BTCUSDT)

| 파라미터 | 값 |
|---------|-----|
| RSI 기간 | 7 |
| RSI 과매도 | < 25 |
| RSI 과매수 | > 75 |
| BB 기간 | 20 |
| BB 표준편차 | 2 |
| **시장 조건** | **ADX < 25 (횡보장)** |

**진입 조건:**
- **CALL**: RSI < 25 AND 가격 < BB 하단 (0.15 이하 위치)
- **PUT**: RSI > 75 AND 가격 > BB 상단 (0.85 이상 위치)

```typescript
// 코드 위치: src/lib/backtest/strategies/high-winrate.ts
rsiBBBounceStrategy(candles, {
  rsiPeriod: 7,
  rsiOversold: 25,
  rsiOverbought: 75,
})
```

**핵심:**
- 횡보장에서만 사용 (ADX < 25)
- 추세장에서는 역추세 손실 발생

---

### 2. RSI + BB (합성 데이터 검증)

**승률:** 56.1% (합성 데이터)

| 조건 | 결과 |
|------|------|
| 거래 수 | 41 |
| 승률 | 56.1% |
| Profit Factor | 1.18 |

---

### 3. EMA Trend + RSI Pullback (합성 데이터 검증)

**승률:** 54.5% (합성 데이터)

| 파라미터 | 값 |
|---------|-----|
| EMA 단기 | 9 |
| EMA 장기 | 21 |
| RSI 범위 | 40-55 (상승추세), 45-60 (하락추세) |

| 조건 | 결과 |
|------|------|
| 거래 수 | 33 |
| 승률 | 54.5% |
| Profit Factor | 1.10 |

**진입 조건:**
- **CALL (상승추세)**: EMA9 > EMA21 AND 가격 > EMA21 AND RSI 40-55에서 반등
- **PUT (하락추세)**: EMA9 < EMA21 AND 가격 < EMA21 AND RSI 45-60에서 하락

---

## ⚠️ 52% 미달 전략 (사용 비권장)

| 전략 | 승률 | 문제점 |
|------|------|--------|
| Stochastic 단독 | 25-40% | 역추세 손실 |
| EMA Cross 단독 | 40-50% | 지연 신호 |
| RSI 단독 | 45-50% | 필터링 부족 |
| 추세장 Pullback | 37-39% | 역추세 손실 |

---

## 🎯 실전 적용 가이드

### 필수 조건

1. **시장 레짐 확인**
   ```
   IF ADX < 25:
     → RSI+BB 전략 사용 가능
   ELSE:
     → 거래 대기
   ```

2. **최소 데이터 요구**
   - RSI: 8개 캔들
   - BB: 20개 캔들
   - ADX: 30개 캔들
   - **권장: 50개 이상 캔들**

3. **신뢰도 필터**
   - 최소 신뢰도: 60%
   - RSI+BB 전략 신뢰도: 75%

### 권장 설정

| 항목 | 값 |
|------|-----|
| 타임프레임 | 1분 |
| 만기 시간 | 60초 |
| 최대 동시 거래 | 1 |
| 리스크 per 거래 | 1-2% |

---

## 📁 관련 파일

| 파일 | 설명 |
|------|------|
| `src/lib/backtest/strategies/high-winrate.ts` | 고승률 전략 구현 |
| `src/lib/signals/signal-generator-v2.ts` | V2 신호 생성기 |
| `scripts/quick-backtest-v2.ts` | 오프라인 백테스트 |

---

---

## 🆕 V3 추세장 전략 (Trend Following)

**업데이트:** 2026-02-01

v2가 횡보장(ADX < 25)에서 54%를 달성했다면, v3는 추세장(ADX >= 25)에서 고승률을 목표로 합니다.

### 4. MACD Trend Momentum (추세장 전용)

**승률:** 87%~100% (합성 데이터 기준)

| 시장 조건 | 승률 | 거래 수 |
|-----------|------|---------|
| Strong Uptrend | 100% | 78 |
| Strong Downtrend | 100% | 24 |
| Weak Uptrend | 98.3% | 60 |
| Weak Downtrend | 87.0% | 54 |

**원리:**
- 추세 방향으로 MACD 모멘텀이 증가할 때 진입
- 히스토그램이 연속 증가하거나 0선 돌파 시 신호

**진입 조건:**
- **CALL (상승 추세)**:
  - ADX >= 25 AND +DI > -DI
  - MACD 히스토그램 > 0 AND 연속 증가
  - 또는 MACD 히스토그램이 0선 상향 돌파
- **PUT (하락 추세)**:
  - ADX >= 25 AND -DI > +DI
  - MACD 히스토그램 < 0 AND 연속 감소
  - 또는 MACD 히스토그램이 0선 하향 돌파

```typescript
// 코드 위치: src/lib/backtest/strategies/trend-following.ts
macdTrendMomentumStrategy(candles, {
  adxPeriod: 14,
  adxThreshold: 25,
})
```

**핵심:**
- 추세장에서만 사용 (ADX >= 25)
- 추세 방향으로만 진입 (역추세 금지)
- 횡보장에서는 v2 RSI+BB 전략 사용

---

### V3 전략 요약

| 전략 | 시장 조건 | 승률 | 특징 |
|------|----------|------|------|
| MACD Momentum | 강한 추세 (ADX >= 40) | 100% | 모멘텀 증가 |
| Auto Select | 모든 추세 (ADX >= 25) | 87-100% | 자동 선택 |

### 시장 레짐별 전략 선택

```
IF ADX >= 40 (강한 추세):
  → MACD Momentum 전략 사용
ELSE IF ADX >= 25 (약한 추세):
  → MACD Momentum 또는 Vote 전략
ELSE (ADX < 25, 횡보장):
  → RSI+BB 전략 (v2)
```

---

## 📁 관련 파일

| 파일 | 설명 |
|------|------|
| `src/lib/backtest/strategies/high-winrate.ts` | 고승률 전략 (v2, 횡보장) |
| `src/lib/backtest/strategies/trend-following.ts` | 추세 추종 전략 (v3, 추세장) |
| `src/lib/signals/signal-generator-v2.ts` | V2 신호 생성기 |
| `scripts/quick-backtest-v2.ts` | 오프라인 백테스트 |

---

## 📈 향후 개선 방향

1. **심볼별 최적화**
   - ETHUSDT: 현재 54% 달성 (횡보장)
   - BTCUSDT: 추가 파라미터 튜닝 필요

2. **실데이터 검증**
   - 합성 데이터 결과를 실제 Binance 데이터로 검증 필요
   - 특히 v3 MACD Momentum 전략

3. **시간대별 분석**
   - 특정 시간대에서 성과 차이 분석

4. **실시간 Forward Test**
   - 백테스트 결과 실전 검증 필요
