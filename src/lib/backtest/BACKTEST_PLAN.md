# 백테스트 시스템 고도화 계획

## 🎯 목표
**추세 판단 + 적절한 알고리즘으로 승률 53% 이상 전략 수집**

---

## 📋 Phase 1: 전략 수집 & 검증 (현재)

### 1.1 전략 후보군
| 전략 | 타입 | 최적 시장 | 상태 |
|------|------|----------|------|
| RSI(7) 25/75 | 반전 | 횡보 | ✅ 구현됨 |
| RSI(14) 30/70 | 반전 | 횡보 | ✅ 구현됨 |
| MACD(12,26,9) | 추세 | 추세장 | ✅ 구현됨 |
| MACD(8,17,9) | 추세 | 추세장 | ✅ 구현됨 |
| SMA Cross(10/30) | 추세 | 강한추세 | ✅ 구현됨 |
| BB(20,2) | 반전 | 횡보 | ✅ 구현됨 |
| Stochastic(14,3) | 반전 | 횡보 | ✅ 구현됨 |
| SMMA+Stoch | 복합 | 횡보 | ✅ 구현됨 |
| Triple Stochastic | 반전 | 횡보 | ⏳ 추가 예정 |
| ATR Breakout | 추세 | 변동성↑ | ⏳ 추가 예정 |
| Williams %R | 반전 | 횡보 | ⏳ 추가 예정 |
| CCI | 복합 | 둘다 | ⏳ 추가 예정 |

### 1.2 검증 기준
- **승률**: >= 53% (92% 페이아웃 손익분기)
- **거래수**: >= 20 (통계적 유의성)
- **Profit Factor**: >= 1.0
- **테스트 데이터**: 
  - 실제 데이터 (Binance BTCUSDT, ETHUSDT, BNBUSDT)
  - 다중 타임프레임 (1m, 5m, 15m)
  - 최소 500캔들

### 1.3 시장 상태 분류 (ADX 기반)
```
ADX >= 40  → 강한 추세 (SMA Cross 사용)
ADX 25-40  → 약한 추세 (MACD 사용)
ADX < 20   → 횡보 (RSI, BB 사용)
ADX 20-25  → 중립 (보수적 RSI 사용)
```

---

## 📋 Phase 2: 실시간 시그널 생성기

### 2.1 구조
```
SignalGenerator
├── DataFetcher (실시간 캔들 수집)
├── RegimeDetector (시장 상태 판단)
├── StrategySelector (적합 전략 선택)
├── SignalEmitter (시그널 발생)
└── Notifier (알림 전송)
```

### 2.2 시그널 포맷
```typescript
interface Signal {
  timestamp: number
  symbol: string
  direction: 'CALL' | 'PUT'
  strategy: string
  regime: MarketRegime
  confidence: number
  expiry: number
  indicators: Record<string, number>
}
```

---

## 📋 Phase 3: 백테스트 시각화

### 3.1 리포트 내용
- 에쿼티 커브 차트
- 드로다운 차트
- 거래 분포 (시간대별, 요일별)
- 승률 히트맵 (전략 x 시장상태)
- 월별/주별 수익률

### 3.2 출력 형식
- HTML 리포트
- JSON 데이터
- 콘솔 요약

---

## 📅 진행 순서

### Step 1: 추가 전략 구현 (현재)
- [ ] Triple Stochastic
- [ ] Williams %R
- [ ] CCI (Commodity Channel Index)
- [ ] ATR Breakout

### Step 2: 대규모 백테스트 실행
- [ ] 모든 전략 x 모든 시장상태 x 다중 심볼
- [ ] 승률 53%+ 전략만 수집
- [ ] 최적 파라미터 저장

### Step 3: 실시간 시그널 생성기
- [ ] WebSocket 데이터 수집
- [ ] 시그널 생성 로직
- [ ] 알림 시스템

### Step 4: 시각화
- [ ] 차트 라이브러리 선택
- [ ] HTML 리포트 생성
- [ ] 대시보드

---

## 📊 수집된 유효 전략 (53%+)

> 백테스트 후 여기에 기록

| 전략 | 시장상태 | 타임프레임 | 승률 | PF | 비고 |
|------|----------|-----------|------|-----|------|
| (테스트 후 추가) | | | | | |

---

*마지막 업데이트: 2026-01-30*
