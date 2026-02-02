# 트레이딩 알고리즘 카탈로그

**목적:** 실데이터 백테스트 준비가 될 때까지 모든 알고리즘을 보존 및 문서화

**상태:** ⏸️ 합성 데이터 테스트만 완료 - 실데이터 검증 필요

---

## 📑 목차

1. [RSI 기반 전략](#1-rsi-기반-전략-5가지)
2. [SMMA + Stochastic 전략](#2-smma--stochastic-전략-2가지)
3. [고승률 전략 (v2)](#3-고승률-전략-v2-6가지)
4. [추세 추종 전략 (v3)](#4-추세-추종-전략-v3-7가지)

---

## 1. RSI 기반 전략 (5가지)

**파일:** `src/lib/backtest/strategies/rsi-strategy.ts`

### 1.1 RSI Overbought/Oversold

| 항목 | 내용 |
|------|------|
| ID | `rsi-ob-os` |
| 원리 | RSI 극단값에서 반전 |
| 시장 조건 | 횡보장 권장 |

**파라미터:**
| 파라미터 | 기본값 | 범위 |
|---------|--------|------|
| period | 14 | 5-30 |
| oversold | 30 | 20-40 |
| overbought | 70 | 60-80 |

**진입 조건:**
```
CALL: RSI가 oversold 아래에서 위로 교차
PUT:  RSI가 overbought 위에서 아래로 교차
```

**신뢰도 계산:**
```typescript
confidence = (oversold - prevRSI) / 10  // CALL
confidence = (prevRSI - overbought) / 10  // PUT
```

---

### 1.2 RSI Divergence

| 항목 | 내용 |
|------|------|
| ID | `rsi-divergence` |
| 원리 | 가격과 RSI 간 다이버전스 |
| 시장 조건 | 추세 전환점 |

**파라미터:**
| 파라미터 | 기본값 | 범위 |
|---------|--------|------|
| period | 14 | 7-21 |
| lookback | 10 | 5-20 |
| minDivergence | 5 | 2-15 |

**진입 조건:**
```
Bullish Divergence (CALL):
  - 가격이 최저점 근처 (priceLL * 1.01 이하)
  - RSI가 최저점보다 minDivergence 이상 높음

Bearish Divergence (PUT):
  - 가격이 최고점 근처 (priceHH * 0.99 이상)
  - RSI가 최고점보다 minDivergence 이상 낮음
```

---

### 1.3 RSI + Bollinger Bands

| 항목 | 내용 |
|------|------|
| ID | `rsi-bb` |
| 원리 | RSI 극단 + BB 밴드 터치 |
| 시장 조건 | 횡보장 |

**파라미터:**
| 파라미터 | 기본값 | 범위 |
|---------|--------|------|
| rsiPeriod | 14 | 7-21 |
| bbPeriod | 20 | 10-30 |
| bbStdDev | 2 | 1-3 |
| oversold | 30 | 20-40 |
| overbought | 70 | 60-80 |

**진입 조건:**
```
CALL: RSI < oversold AND price <= BB하단 * 1.001
PUT:  RSI > overbought AND price >= BB상단 * 0.999
```

---

### 1.4 RSI + Stochastic

| 항목 | 내용 |
|------|------|
| ID | `rsi-stoch` |
| 원리 | RSI와 Stochastic 이중 확인 |
| 시장 조건 | 횡보장 |

**파라미터:**
| 파라미터 | 기본값 | 범위 |
|---------|--------|------|
| rsiPeriod | 14 | 7-21 |
| stochK | 14 | 5-21 |
| stochD | 3 | 2-5 |
| oversold | 20 | 10-30 |
| overbought | 80 | 70-90 |

**진입 조건:**
```
CALL: RSI < oversold+10 AND Stoch K,D 모두 < oversold
PUT:  RSI > overbought-10 AND Stoch K,D 모두 > overbought
```

---

### 1.5 RSI Trend Following

| 항목 | 내용 |
|------|------|
| ID | `rsi-trend` |
| 원리 | RSI 50 기준 추세 추종 |
| 시장 조건 | 추세장 |

**파라미터:**
| 파라미터 | 기본값 | 범위 |
|---------|--------|------|
| period | 14 | 7-21 |
| threshold | 5 | 2-15 |
| confirmBars | 3 | 2-5 |

**진입 조건:**
```
CALL: 최근 confirmBars 동안 RSI > 50+threshold AND 상승 중
PUT:  최근 confirmBars 동안 RSI < 50-threshold AND 하락 중
```

---

## 2. SMMA + Stochastic 전략 (2가지)

**파일:** `src/lib/backtest/strategies/smma-stochastic.ts`
**출처:** 비트신옵션 YouTube (https://www.youtube.com/watch?v=8uCDh1wfRhc)

### 2.1 SMMA + Stochastic (Standard)

| 항목 | 내용 |
|------|------|
| ID | `smma-stoch-bitshin` |
| 원리 | 11개 SMMA로 추세 + Stochastic 크로스 |
| 권장 설정 | 15초 캔들, 1분 만기 |

**SMMA 설정:**
```
Short (Green): 3, 5, 7, 9, 11, 13
Long (Red):    30, 35, 40, 45, 50
```

**파라미터:**
| 파라미터 | 기본값 | 범위 |
|---------|--------|------|
| stochK | 14 | 5-21 |
| stochD | 3 | 2-5 |
| oversold | 20 | 10-30 |
| overbought | 80 | 70-90 |
| trendStrength | 6 | 3-6 |

**진입 조건:**
```
CALL:
  - trendStrength개 이상의 short MA가 모든 long MA 위
  - Stochastic golden cross (K가 D 상향돌파)
  - 과매도 구간에서 시작

PUT:
  - trendStrength개 이상의 short MA가 모든 long MA 아래
  - Stochastic dead cross (K가 D 하향돌파)
  - 과매수 구간에서 시작
```

---

### 2.2 SMMA + Stochastic (Aggressive)

| 항목 | 내용 |
|------|------|
| ID | `smma-stoch-aggressive` |
| 차이점 | trendStrength=4, overlapTolerance=1 |

더 적극적인 진입을 위해 4/6 MA만 추세 확인

---

## 3. 고승률 전략 v2 (6가지)

**파일:** `src/lib/backtest/strategies/high-winrate.ts`
**목표:** 92% 페이아웃에서 수익을 위한 52.1%+ 승률

### 3.1 RSI + MACD

| 항목 | 내용 |
|------|------|
| 함수 | `rsiMacdStrategy()` |
| 원리 | RSI 극단 + MACD 확인 |
| 신뢰도 | 70% |

**파라미터:**
| 파라미터 | 기본값 |
|---------|--------|
| rsiPeriod | 7 |
| rsiOversold | 25 |
| rsiOverbought | 75 |

**진입 조건:**
```
CALL: RSI < 25 AND RSI 상승 AND (MACD히스토그램 > 0 OR 히스토그램 상승)
PUT:  RSI > 75 AND RSI 하락 AND (MACD히스토그램 < 0 OR 히스토그램 하락)
```

---

### 3.2 RSI + Bollinger Bands Bounce

| 항목 | 내용 |
|------|------|
| 함수 | `rsiBBBounceStrategy()` |
| 원리 | RSI 극단 + BB 밴드 터치 |
| 신뢰도 | 75% |
| ⭐ 검증 | 횡보장(ADX<25)에서 54% 달성 |

**진입 조건:**
```
CALL: RSI < 25 AND BB position < 0.15 (하단 밴드 근처)
PUT:  RSI > 75 AND BB position > 0.85 (상단 밴드 근처)
```

---

### 3.3 Simple RSI Reversal (ADX 없음)

| 항목 | 내용 |
|------|------|
| 함수 | `adxFilteredRsiStrategy()` |
| 원리 | 극단적 RSI에서 반전 |
| 신뢰도 | 65% |

**진입 조건:**
```
CALL: RSI < 20 AND RSI 상승 시작
PUT:  RSI > 80 AND RSI 하락 시작
```

---

### 3.4 Triple Confirmation

| 항목 | 내용 |
|------|------|
| 함수 | `tripleConfirmationStrategy()` |
| 원리 | RSI + Stochastic + MACD 3중 확인 |
| 신뢰도 | 80% |

**진입 조건:**
```
CALL:
  - RSI < 35
  - Stochastic K < 30 AND K 상승 AND K > D
  - MACD 히스토그램 > 0

PUT:
  - RSI > 65
  - Stochastic K > 70 AND K 하락 AND K < D
  - MACD 히스토그램 < 0
```

---

### 3.5 EMA Trend + RSI Pullback

| 항목 | 내용 |
|------|------|
| 함수 | `emaTrendRsiPullbackStrategy()` |
| 원리 | EMA 추세 + RSI 풀백 |
| 신뢰도 | 70% |

**진입 조건:**
```
CALL (상승추세):
  - EMA9 > EMA21 AND 가격 > EMA21
  - RSI 40-55 구간에서 반등

PUT (하락추세):
  - EMA9 < EMA21 AND 가격 < EMA21
  - RSI 45-60 구간에서 하락
```

---

### 3.6 Vote Strategy

| 항목 | 내용 |
|------|------|
| 함수 | `voteStrategy()` |
| 원리 | 5개 전략 투표 |

**동작:**
- 5개 전략 모두 실행
- minVotes개 이상 동의 시 신호 생성
- 기본 minVotes = 3

---

## 4. 추세 추종 전략 v3 (7가지)

**파일:** `src/lib/backtest/strategies/trend-following.ts`
**목표:** 추세장(ADX >= 25)에서 52.1%+ 승률

### 공통 파라미터

| 파라미터 | 기본값 | 설명 |
|---------|--------|------|
| adxPeriod | 14 | ADX 계산 기간 |
| adxThreshold | 25 | 추세 확인 임계값 |
| strongTrendThreshold | 40 | 강한 추세 임계값 |
| emaFast | 9 | 빠른 EMA |
| emaSlow | 21 | 느린 EMA |
| rsiPeriod | 14 | RSI 기간 |

---

### 4.1 ADX + DI Crossover

| 항목 | 내용 |
|------|------|
| 함수 | `adxDiCrossoverStrategy()` |
| 원리 | DI 크로스오버 |

**진입 조건:**
```
CALL: ADX >= 25 AND +DI가 -DI 상향 돌파
PUT:  ADX >= 25 AND -DI가 +DI 상향 돌파
```

**신뢰도:** `min(0.5 + ADX/100, 0.85)`

---

### 4.2 Trend Pullback

| 항목 | 내용 |
|------|------|
| 함수 | `trendPullbackStrategy()` |
| 원리 | 추세 중 조정 진입 |

**진입 조건:**
```
CALL (상승추세):
  - ADX >= 25 AND EMAfast > EMAslow AND DI trend = up
  - RSI 35-55 구간에서 반등
  - 가격 >= EMAslow * 0.998

PUT (하락추세):
  - ADX >= 25 AND EMAfast < EMAslow AND DI trend = down
  - RSI 45-65 구간에서 하락
  - 가격 <= EMAslow * 1.002
```

---

### 4.3 MACD Trend Momentum ⭐

| 항목 | 내용 |
|------|------|
| 함수 | `macdTrendMomentumStrategy()` |
| 원리 | MACD 모멘텀 추종 |
| ⭐ 합성 데이터 | 87-100% 승률 |

**진입 조건:**
```
CALL (상승추세, ADX trend = up):
  - MACD 히스토그램 > 0 AND 연속 증가 (3개 이상)
  - 또는 MACD 히스토그램이 0선 상향 돌파

PUT (하락추세, ADX trend = down):
  - MACD 히스토그램 < 0 AND 연속 감소 (3개 이상)
  - 또는 MACD 히스토그램이 0선 하향 돌파
```

---

### 4.4 Supertrend

| 항목 | 내용 |
|------|------|
| 함수 | `supertrendStrategy()` |
| 원리 | ATR 기반 동적 지지/저항 |

**계산:**
```
ATR = 10일 평균 True Range
UpperBand = HL2 + (multiplier * ATR)
LowerBand = HL2 - (multiplier * ATR)
multiplier = 3 (기본값)
```

**진입 조건:**
```
CALL: 상승추세 + 가격이 LowerBand 근처에서 반등
PUT:  하락추세 + 가격이 UpperBand 근처에서 하락
```

---

### 4.5 EMA Ribbon

| 항목 | 내용 |
|------|------|
| 함수 | `emaRibbonStrategy()` |
| 원리 | 5개 EMA 정렬 |

**EMA 기간:** 8, 13, 21, 34, 55

**진입 조건:**
```
CALL (Bullish Alignment):
  - EMA8 > EMA13 > EMA21 > EMA34 > EMA55
  - ADX trend = up
  - 가격이 EMA8 근처 (0.998~1.005)

PUT (Bearish Alignment):
  - EMA8 < EMA13 < EMA21 < EMA34 < EMA55
  - ADX trend = down
  - 가격이 EMA8 근처 (0.995~1.002)
```

---

### 4.6 Trend Vote Strategy

| 항목 | 내용 |
|------|------|
| 함수 | `trendVoteStrategy()` |
| 원리 | 5개 추세 전략 투표 |

**동작:**
- 5개 전략 모두 실행
- minVotes개 이상 동의 + 다수결 시 신호 생성
- 기본 minVotes = 2

---

### 4.7 Auto Select Strategy

| 항목 | 내용 |
|------|------|
| 함수 | `selectBestTrendStrategy()` |
| 원리 | ADX 값에 따라 자동 선택 |

**로직:**
```
IF ADX < 25:
  → 신호 없음 (횡보장 → v2 사용)

IF ADX >= 40 (강한 추세):
  1순위: DI Crossover
  2순위: MACD Momentum
  3순위: EMA Ribbon

IF 25 <= ADX < 40 (약한 추세):
  1순위: Trend Pullback
  2순위: Supertrend
  3순위: Vote Strategy
```

---

## 📊 전략별 적합 시장 조건 요약

| 전략 그룹 | 시장 조건 | ADX 기준 |
|----------|----------|----------|
| RSI 반전 | 횡보장 | < 25 |
| RSI + BB | 횡보장 | < 25 |
| RSI Divergence | 추세 전환점 | - |
| RSI Trend | 추세장 | >= 25 |
| SMMA + Stoch | 추세장 | >= 25 |
| 고승률 v2 | **횡보장** | < 25 |
| 추세 추종 v3 | **추세장** | >= 25 |

---

## 📁 파일 위치 요약

| 파일 | 전략 수 | 설명 |
|------|---------|------|
| `rsi-strategy.ts` | 5 | RSI 기반 전략 |
| `smma-stochastic.ts` | 2 | SMMA + Stoch 전략 |
| `high-winrate.ts` | 6 | 고승률 전략 v2 |
| `trend-following.ts` | 7 | 추세 추종 v3 |
| **총합** | **20** | |

---

## ⚠️ 주의사항

1. **모든 결과는 합성 데이터 기준**
   - 실제 Pocket Option 가격과 다를 수 있음
   - 실데이터 백테스트 필수

2. **Binance 데이터 ≠ Pocket Option 데이터**
   - 가격 차이 존재
   - 실전 성과 검증 필요

3. **실전 적용 전 Forward Test 권장**

---

## 🔜 TODO

- [ ] 실데이터 수집 시스템 구축
- [ ] Pocket Option 데이터 기반 백테스트
- [ ] 심볼별/시간대별 최적화
- [ ] 실시간 Forward Test
