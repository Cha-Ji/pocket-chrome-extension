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

### Forward Test 기본 구조

```typescript
// scripts/forward-test.ts 참고
// 1. 시그널 생성
// 2. 거래 실행
// 3. 결과 대기 (60초 만료)
// 4. 승/패 기록
// 5. 통계 계산
```
