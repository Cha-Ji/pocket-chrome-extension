# Chart Parsing for LLM - Findings

**생성일:** 2026-01-30
**목적:** LLM이 차트 데이터를 이해하기 쉽게 변환하는 방법 연구

---

## 핵심 원칙

### LLM이 이해하기 좋은 데이터 형식

1. **구조화된 텍스트** > 이미지
2. **숫자 배열** > 시각적 패턴
3. **명시적 상태** > 암시적 정보

---

## 방법 1: OHLCV 텍스트 변환

```
# 최근 5개 캔들 (1분봉)
| Time | Open | High | Low | Close | Change |
|------|------|------|-----|-------|--------|
| 21:00 | 178.50 | 178.80 | 178.40 | 178.70 | +0.11% |
| 21:01 | 178.70 | 178.90 | 178.60 | 178.85 | +0.08% |
| 21:02 | 178.85 | 179.00 | 178.70 | 178.75 | -0.06% |
| 21:03 | 178.75 | 178.80 | 178.50 | 178.55 | -0.11% |
| 21:04 | 178.55 | 178.70 | 178.45 | 178.60 | +0.03% |
```

**장점:** 정확한 수치, 계산 가능
**단점:** 패턴 인식 어려움

---

## 방법 2: 인디케이터 상태 요약

```yaml
current_state:
  asset: "Apple OTC"
  price: 178.60
  trend: "sideways"  # up/down/sideways
  
indicators:
  rsi_14:
    value: 45.2
    zone: "neutral"  # oversold/neutral/overbought
    signal: null
    
  stochastic_14_3_3:
    k: 35.5
    d: 38.2
    zone: "neutral"
    crossover: null  # bullish/bearish/null
    
  bollinger_20_2:
    upper: 179.50
    middle: 178.80
    lower: 178.10
    price_position: "middle"  # above_upper/upper_half/middle/lower_half/below_lower
    bandwidth: "normal"  # tight/normal/wide

signals:
  call_strength: 0.3  # 0-1
  put_strength: 0.2   # 0-1
  recommendation: "wait"  # call/put/wait
```

**장점:** 의미 있는 해석 포함, 의사결정 용이
**단점:** 정보 손실 가능

---

## 방법 3: 패턴 언어 변환

차트 패턴을 자연어로 기술:

```
CHART_SUMMARY:
- 가격이 볼린저 중간선(178.80) 근처에서 횡보 중
- RSI(45.2)는 중립 영역, 방향성 약함
- 스토캐스틱 K선(35.5)이 D선(38.2) 아래, 약간 약세
- 최근 5캔들 중 3개 음봉, 단기 약세 압력
- 명확한 진입 신호 없음, 관망 권장
```

**장점:** 맥락과 해석 포함
**단점:** 주관적, 일관성 어려움

---

## 방법 4: ASCII 차트

```
Price: Apple OTC (178.60)
179.5 |      ╭─╮                    ← BB Upper
179.0 |   ╭──╯ ╰─╮    
178.8 |───────────────────────────  ← BB Middle
178.6 |          ╰───●              ← Current
178.1 |                             ← BB Lower
      └─────────────────────────────
        -5   -4   -3   -2   -1   now

RSI[14]: ████████████░░░░░░░░ 45.2 (neutral)
Stoch:   ███████░░░░░░░░░░░░░ K:35.5 D:38.2
```

**장점:** 시각적 패턴 + 텍스트
**단점:** 해상도 낮음

---

## 권장 접근법: 하이브리드

```json
{
  "timestamp": "2026-01-30T06:21:00+09:00",
  "asset": "Apple OTC",
  "timeframe": "1m",
  
  "price": {
    "current": 178.60,
    "change_1m": -0.11,
    "change_5m": +0.06
  },
  
  "indicators": {
    "rsi": {"value": 45.2, "signal": "neutral"},
    "stochastic": {"k": 35.5, "d": 38.2, "signal": "neutral"},
    "bb_position": "middle"
  },
  
  "pattern": {
    "trend": "sideways",
    "volatility": "low",
    "support": 178.10,
    "resistance": 179.50
  },
  
  "summary": "횡보 중, 명확한 신호 없음",
  "action": "WAIT",
  "confidence": 0.3
}
```

---

## 구현 전략

### Phase 1: 기본 데이터 수집
- WebSocket에서 가격 데이터 추출
- 페이지 인디케이터 값 읽기

### Phase 2: 상태 계산
- 자체 인디케이터 계산
- 신호 강도 산출

### Phase 3: LLM 친화적 변환
- JSON 구조화
- 자연어 요약 생성

---

## LLM 친화적 문서 작성 규칙

1. **구조화**: 헤더, 리스트, 테이블 사용
2. **명시적**: 암시하지 말고 직접 서술
3. **수치화**: 가능하면 숫자로 표현
4. **일관성**: 동일한 포맷 유지
5. **맥락 포함**: 왜 중요한지 설명
6. **액션 가능**: 다음 단계 명시
