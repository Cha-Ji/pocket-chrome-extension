# Findings - 백테스트 & 전략 분석 결과

## 📅 2026-01-30

---

## 🏆 유효 전략 (53%+ 승률)

### Top 10 - 백테스트 결과
| 순위 | 전략 | 심볼 | TF | 승률 | PF |
|-----|------|------|-----|------|-----|
| 1 | EMA Cross (12/26) | BTCUSDT | 5m | 80.0% | 3.68 |
| 2 | EMA Cross (5/13) | BTCUSDT | 1m | 75.0% | 2.76 |
| 3 | TripleStoch (5/14/21) | BTCUSDT | 5m | 75.0% | 2.76 |
| 4 | Williams%R (10) | BTCUSDT | 5m | 64.0% | 1.64 |
| 5 | Stochastic (14/3) | ETHUSDT | 1m | 63.3% | 1.58 |
| 6 | RSI (14) 35/65 | BTCUSDT | 5m | 62.5% | 1.53 |
| 7 | SMA Cross (10/30) | BTCUSDT | 1m | 62.5% | 1.53 |
| 8 | RSI (7) 25/75 | BTCUSDT | 1m | 61.1% | 1.45 |
| 9 | MACD (5/13/6) | ETHUSDT | 1m | 59.5% | 1.44 |
| 10 | CCI (14) | ETHUSDT | 1m | 58.1% | 1.28 |

---

## 🔴 Forward Test 결과 (핵심 발견)

### 1시간 Forward Test (24거래)

| 전략 | 백테스트 | 실전 | 차이 | 판정 |
|------|---------|------|------|------|
| RSI (14) 35/65 | 62.5% | **100%** | +37.5% | ✅ **사용** |
| Stochastic (14/3) | 63.3% | **25%** | -38.3% | ❌ **비활성화** |
| EMA Cross (5/13) | 75.0% | **33%** | -42.0% | ⚠️ **조건부** |

### 핵심 결론
1. **RSI만 실전에서 작동**: 백테스트 결과와 무관하게 RSI만 수익
2. **Stochastic 완전 실패**: 백테스트에서 좋아도 실전에서 실패
3. **EMA Cross**: ADX 30+ (강한 추세)에서만 사용

---

## 📊 V2 전략 설계 (2026-01-31)

### RSI V2 - 강화된 조건
```typescript
// 진입 조건
CALL: RSI가 30 이하 → 35 위로 크로스 (과매도 탈출)
PUT: RSI가 70 이상 → 65 아래로 크로스 (과매수 탈출)

// 추가 필터
- 연속 캔들 필터: 3연속 같은 방향이면 무효
- 시장 상태: ranging, weak_trend에서 최적
```

### EMA Cross V2 - ADX 조건 필수
```typescript
// 진입 조건
CALL: FastEMA > SlowEMA 크로스 + 상승 추세
PUT: FastEMA < SlowEMA 크로스 + 하락 추세

// 필수 조건
- ADX >= 30 (강한 추세)
- 추세 방향과 신호 방향 일치
```

### Stochastic - 비활성화
```typescript
// 이유: 실전 25% 승률
// 상태: 코드에서 제거됨
```

---

## 🎯 시장 상태별 최적 전략 매트릭스 (V2)

| 시장 상태 | 최적 전략 | 피해야 할 전략 | 비고 |
|----------|----------|---------------|------|
| 강한 상승 (ADX ≥40, +DI) | EMA Cross V2 (CALL) | RSI PUT | 추세 추종 |
| 강한 하락 (ADX ≥40, -DI) | EMA Cross V2 (PUT) | RSI CALL | 추세 추종 |
| 약한 추세 (ADX 25-40) | RSI V2 | EMA Cross | 반전 신호 |
| 횡보 (ADX <25) | RSI V2 (양방향) | 모든 추세 전략 | 과매수/매도 |

---

## 🔧 DOM 데이터 수집 (외부 API 불가)

### 결정사항
- ❌ **Binance API 사용 불가**: Pocket Option 가격과 다름
- ✅ **DOM 직접 수집**: Pocket Option 내부 가격 사용

### DOM 셀렉터 (추정)
```typescript
const SELECTORS = {
  currentPrice: '.chart-item .value, .chart-block__price .value',
  priceValue: '.chart-item .value__val',
  assetName: '.chart-item .pair, .chart-block .pair',
}
```

### 데이터 수집 방식
1. **MutationObserver**: 가격 변화 실시간 감지
2. **Polling 백업**: 500ms마다 DOM 스크래핑
3. **캔들 변환**: Tick → 1분 캔들
4. **IndexedDB 저장**: 최대 500개 캔들 보관

---

## 💡 핵심 인사이트

1. **백테스트 ≠ 실전**: 심각한 괴리 발견 (Stochastic 63% → 25%)
2. **RSI가 가장 안정적**: 모든 시장에서 일관된 성과
3. **추세 전략은 조건부**: ADX 30+ 필수
4. **DOM 직접 수집 필수**: 외부 데이터 신뢰 불가

---

## ⚠️ 주의사항

- Pocket Option DOM 구조는 변경될 수 있음
- 최소 100거래 이상 Forward Test 필요
- 페이아웃 92% 이상 자산만 거래

---

## 📅 2026-01-30 (이전 기록)

### 페이아웃 우선 전략

**왜 페이아웃이 중요한가?**
```
승률 55% + 페이아웃 92% = 기대값 +1.1%
승률 60% + 페이아웃 80% = 기대값 -8%
```

**손익분기점 계산:**
- 페이아웃 92%: 필요 승률 52.1%
- 페이아웃 85%: 필요 승률 54.1%
- 페이아웃 80%: 필요 승률 55.6%
