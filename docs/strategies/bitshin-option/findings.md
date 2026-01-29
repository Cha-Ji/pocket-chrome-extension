# 비트신옵션 채널 분석 - Findings

**최종 업데이트:** 2026-01-30 06:24 KST
**채널:** https://www.youtube.com/@BITSHINOPTION

---

## 영상 1: SMMA + 스토캐스틱 전략

**영상:** [포켓옵션 2026 | 새로운 트레이딩 기법 정리](https://www.youtube.com/watch?v=8uCDh1wfRhc)

### 세팅

| 항목 | 값 |
|------|-----|
| 캔들 타임프레임 | 15초 |
| 만료 시간 | 1분 |
| 자금 관리 | 시드의 1-2% |

### 인디케이터 설정

#### 1. SMMA (Smoothed Moving Average) - 총 11개

**단기 이평선 (녹색) - 6개:**
| 순서 | Period | Type | Color |
|------|--------|------|-------|
| 1 | 3 | SMMA | 기본(녹색) |
| 2 | 5 | SMMA | 기본 |
| 3 | 7 | SMMA | 기본 |
| 4 | 9 | SMMA | 기본 |
| 5 | 11 | SMMA | 기본 |
| 6 | 13 | SMMA | 기본 |

**장기 이평선 (빨간색) - 5개:**
| 순서 | Period | Type | Color |
|------|--------|------|-------|
| 1 | 30 | SMMA | 빨간색 |
| 2 | 35 | SMMA | 빨간색 |
| 3 | 40 | SMMA | 빨간색 |
| 4 | 45 | SMMA | 빨간색 |
| 5 | 50 | SMMA | 빨간색 |

**패턴:** 
- 단기: 3부터 2씩 증가 (3, 5, 7, 9, 11, 13)
- 장기: 30부터 5씩 증가 (30, 35, 40, 45, 50)

#### 2. 스토캐스틱

| 설정 | 값 |
|------|-----|
| K Period | 기본값 |
| D Period | 기본값 |
| Smoothing | 기본값 |
| K 색상 | 파란색 → 녹색 |
| D 색상 | 주황색 → 빨간색 |
| 나머지 | 흰색 |

### 진입 조건

#### CALL (매수)
```
조건 1: 단기 이평선(녹색) > 장기 이평선(빨간색)
        → 상승 추세 확인
        
조건 2: 스토캐스틱 과매도 구간에서 골든크로스
        → K선이 D선을 상향 돌파
        
진입: 두 조건 모두 충족 시
```

#### PUT (매도)
```
조건 1: 단기 이평선(녹색) < 장기 이평선(빨간색)
        → 하락 추세 확인
        
조건 2: 스토캐스틱 과매수 구간에서 데드크로스
        → K선이 D선을 하향 돌파
        
진입: 두 조건 모두 충족 시
```

### 추가 규칙

1. **캔들 마감 확인:** 진입 전 캔들이 마감되기를 기다림
2. **이평선 겹침 금지:** 단기/장기 이평선이 겹치지 않을 때만 진입
3. **추세 명확성:** 이평선들이 명확히 분리되어 있을 때 진입

### 주의사항

- 100% 승률 아님, 꾸준히 해야 자산 우상향 가능
- 연습 기간 필요
- 여러 차트에서 조건 맞는 것 찾아 진입

---

## 백테스트 구현 계획

```typescript
// SMMA + Stochastic Strategy
interface SMMAStochStrategy {
  shortTermMAs: [3, 5, 7, 9, 11, 13];  // SMMA
  longTermMAs: [30, 35, 40, 45, 50];   // SMMA
  stochastic: { k: 14, d: 3, smooth: 3 };
  
  entryConditions: {
    call: {
      trend: 'all_short > all_long',
      signal: 'stoch_golden_cross_from_oversold'
    },
    put: {
      trend: 'all_short < all_long',
      signal: 'stoch_dead_cross_from_overbought'
    }
  };
  
  timeframe: '15s';
  expiry: '1m';
}
```

---

## 요약 (LLM 친화적)

```yaml
strategy:
  name: "SMMA + Stochastic (비트신옵션)"
  source: "https://www.youtube.com/watch?v=8uCDh1wfRhc"
  
  settings:
    candle: "15s"
    expiry: "1m"
    risk: "1-2% per trade"
  
  indicators:
    smma_short: [3, 5, 7, 9, 11, 13]  # green
    smma_long: [30, 35, 40, 45, 50]   # red
    stochastic: default
  
  entry:
    call:
      - "short_mas ABOVE long_mas (uptrend)"
      - "stoch golden cross from oversold"
    put:
      - "short_mas BELOW long_mas (downtrend)"
      - "stoch dead cross from overbought"
  
  rules:
    - "wait for candle close"
    - "no overlapping MAs"
    - "clear trend separation"
```
