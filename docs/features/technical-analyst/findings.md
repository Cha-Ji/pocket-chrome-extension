# 발견사항 — Technical Analyst (기술적 분석)

## 결정 사항

- (2026-01-26) RSI/볼린저밴드/이동평균 지표를 우선 지원
- (2026-02-06) 2가지 지표 사용 경로: 자체 계산(`lib/indicators`) + DOM 읽기(`indicator-reader.ts`)
- (2026-02-06) 캔버스 오버레이는 미구현 — 대신 Side Panel에서 신호로 표시

## 제약/가정

- (2026-01-26) 차트 위 캔버스 오버레이 렌더링 필요 — **현재 미구현**
- (2026-02-06) PO 페이지의 인디케이터 DOM 셀렉터는 사이트 업데이트 시 변경될 수 있음
- (2026-02-06) DOM 읽기 방식은 PO 페이지에서 인디케이터를 활성화해야만 작동

## 핵심 정보

- (2026-01-26) technicalindicators 라이브러리 활용 검토 → **(2026-02-06) 자체 구현으로 결정**
- (2026-01-26) 투명 캔버스로 기존 차트와 동기화 — **미구현 (향후 과제)**

### 경로 1: 자체 계산 (`src/lib/indicators/index.ts`)

순수 TypeScript로 구현된 기술적 지표 라이브러리. 외부 의존성 없음.

| 지표 | 함수 | 파라미터 |
|---|---|---|
| SMA | `calculateSMA(data, period)` | period: 기간 |
| EMA | `calculateEMA(data, period)` | period: 기간 |
| RSI | `calculateRSI(data, period)` | period: 기본 14 |
| MACD | `calculateMACD(data, fast, slow, signal)` | 12, 26, 9 기본 |
| Stochastic | `calculateStochastic(highs, lows, closes, K, D)` | K:14, D:3 기본 |
| Bollinger Bands | `calculateBollingerBands(data, period, stdDev)` | 20, 2.0 기본 |
| ATR | `calculateATR(candles, period)` | period: 14 기본 |
| Williams %R | `calculateWilliamsR(highs, lows, closes, period)` | period: 14 기본 |
| CCI | `calculateCCI(candles, period)` | period: 20 기본 |
| ADX | `calculateADX(candles, period)` | period: 14 기본 — 시장 레짐 감지에 핵심 |

### 경로 2: DOM 읽기 (`src/content-script/indicator-reader.ts`)

Pocket Option 페이지에 표시된 인디케이터 값을 DOM에서 직접 읽어옴:

- **다중 셀렉터 패턴**: 각 지표마다 7~8개 CSS 셀렉터를 순차적으로 시도
- **지원 지표**: RSI, Stochastic (K/D), MACD (macd/signal/histogram), Bollinger Bands (upper/middle/lower)
- **반환 타입**: `IndicatorValues` (모든 값 optional, timestamp 포함)

### 신호 전략에서의 활용 (`lib/signals/`)

**v1 전략** (`strategies.ts`):
- `emaCrossSignal()` — EMA(12/26) 골든/데드 크로스
- `rsiSignal()` — RSI(14) 과매도(35)/과매수(65) 교차
- `stochSignal()` — Stochastic(14/3) 과매도(20)/과매수(80) 교차
- `detectRegime()` — ADX 기반 시장 레짐 분류 (strong/weak trend, ranging)

**v2 전략** (`signal-generator-v2.ts`):
- `voteStrategy()` — 다수결 투표 방식 (여러 지표 동의 시 신호)
- `rsiBBBounceStrategy()` — RSI + BB 하단 터치 동시 조건
- `emaTrendRsiPullbackStrategy()` — EMA 추세 + RSI 풀백
- `tripleConfirmationStrategy()` — 3중 확인 (추세 + 모멘텀 + 과매수/과매도)

## 코드 스니펫

```typescript
// 시장 레짐 감지 (핵심 로직)
function detectRegime(candles: Candle[]): { regime: MarketRegime; adx: number; direction: number } {
  const { adx, plusDI, minusDI } = calculateADX(candles, 14)
  const direction = plusDI > minusDI ? 1 : -1

  if (adx >= 40) regime = direction > 0 ? 'strong_uptrend' : 'strong_downtrend'
  else if (adx >= 25) regime = direction > 0 ? 'weak_uptrend' : 'weak_downtrend'
  else regime = 'ranging'
}
```
