# Findings - PO-11

## 결정 사항

- (2026-02-01) PO-11 이슈: 실시간 데이터 수집 개선 및 Forward Test 검증으로 범위 확정
- (2026-02-01) Forward Test 우선순위 상승 - 합성 데이터 백테스트 완료(56.1%) 후 실전 검증 필요

## 제약/가정

- (2026-02-01) Binance API 네트워크 이슈로 실제 히스토리컬 데이터 검증 지연
- (2026-02-01) Pocket Option 가격 ≠ Binance 가격 (자체 DOM 수집 필수)
- (2026-02-01) 데모 모드에서만 자동매매 실행 (3중 체크 필수)

## 핵심 정보

### 현재 구현 상태

| 모듈 | 상태 | 비고 |
|------|------|------|
| CandleCollector | 구현됨 | 1분 캔들, DOM 폴링 500ms |
| DataCollector | 구현됨 | MutationObserver + 폴링 |
| IndicatorReader | 구현됨 | RSI/Stochastic/MACD/BB 셀렉터 |
| Forward Test | 부분 구현 | scripts/forward-test.ts 존재 |

### DOM 셀렉터 (Pocket Option)

```typescript
const SELECTORS = {
  currentPrice: '.chart-item .value, .chart-block__price .value',
  priceValue: '.chart-item .value__val, .chart-block__price .value__val',
  chartCanvas: 'canvas.chart-area',
  chartContainer: '.chart-item, .chart-block',
  assetName: '.chart-item .pair, .chart-block .pair',
}
```

### 검증된 전략 (백테스트 결과)

| 전략 | 승률 | 거래수 | 상태 |
|------|------|--------|------|
| RSI+BB | 56.1% | 41 | Forward Test 필요 |
| EMA Pullback | 54.5% | 33 | Forward Test 필요 |

## 코드 스니펫

### Forward Test V2 사용법

```bash
# 기본 실행 (60분, Binance API)
npx tsx scripts/forward-test.ts

# 로컬 데이터 사용 (API 실패 대비)
npx tsx scripts/forward-test.ts --local

# 시간 지정 (30분)
npx tsx scripts/forward-test.ts 30

# 심볼 지정
npx tsx scripts/forward-test.ts --symbol=ETHUSDT --local
```

### IndicatorReader 테스트 결과 (2026-02-01)

```
✓ src/content-script/indicator-reader.test.ts (24 tests) 63ms
   - DOM 파싱: RSI, Stochastic K/D 정상 동작
   - 엣지 케이스: 잘못된 형식, 범위 초과 처리 확인
   - 이벤트 구독/해제 정상 동작
```

### V1 Forward Test 실패 분석

| 전략 | 거래수 | 승률 | 분석 |
|------|--------|------|------|
| RSI (14) | 8 | 62.5% | ✅ 유지 |
| Stochastic | 19 | 31.6% | ❌ 제거 필요 |
| EMA Cross | 8 | 37.5% | ⚠️ ADX 30+ 조건 추가 |

→ V2에서 Stochastic 제거, EMA에 ADX 조건 추가

## 관련 참조
- Forward Test V1→V2 분석: [PO-13](../PO-13/)
- DOM 셀렉터 상세: [dom-selectors](../../architecture/content-script/dom-selectors/)
- 데이터 수집 최적화: [PO-19](../PO-19/)
- 지표 라이브러리: `src/lib/indicators/index.ts`
- 전략 구현체: `src/lib/backtest/strategies/`
