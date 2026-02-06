# 발견사항 — Backtester & Logger (백테스트/로깅)

## 결정 사항

- (2026-01-26) 백테스팅과 로컬 기록을 통합 관리
- (2026-02-06) 전략 리더보드 시스템 추가 — compositeScore 기반 순위
- (2026-02-06) 로깅은 `lib/logger` 모듈로 중앙화 (모듈별 컬러 로거)

## 제약/가정

- (2026-01-26) 대량 데이터 재생 시 성능 고려 필요
- (2026-02-06) 백테스트는 IndexedDB의 candles 테이블 데이터 기반 (수집 데이터 필요)
- (2026-02-06) `fast-test.ts` / `quick-test.ts`로 경량 백테스트 지원

## 핵심 정보

- (2026-01-26) 리플레이로 과거 데이터 기반 승률 계산
- (2026-01-26) CSV 내보내기 및 수익 곡선 리포트 제공

### 백테스트 엔진 (`src/lib/backtest/`)

**핵심 파일**:
- `engine.ts` — 백테스트 메인 루프: 캔들 데이터 순회 → 전략 신호 → 가상 주문 → 결과 판정
- `statistics.ts` — 백테스트 통계 계산: 승률, 수익 팩터, 최대 드로다운, Sharpe ratio, 기대값
- `optimizer.ts` — 파라미터 그리드 서치: 전략 파라미터 조합별 백테스트 실행 → 최적 파라미터 탐색
- `report-generator.ts` — 백테스트 결과 리포트 생성
- `leaderboard-types.ts` — 리더보드 엔트리 타입 (strategyId, compositeScore, winRate, rank 등)

**전략 구현체** (`strategies/`):
| 전략 | 파일 | 핵심 로직 |
|---|---|---|
| RSI 반전 | `rsi-strategy.ts` | RSI 과매수/과매도 교차 |
| MACD 크로스 | `macd-strategy.ts` | MACD-시그널 라인 교차 |
| 볼린저 밴드 | `bollinger-strategy.ts` | BB 상/하단 터치 반전 |
| Stochastic RSI | `stochastic-rsi-strategy.ts` | Stochastic + RSI 결합 |
| ATR 돌파 | `atr-breakout-strategy.ts` | ATR 기반 변동성 돌파 |
| Williams %R | `williams-r-strategy.ts` | Williams %R 과매수/과매도 |
| CCI | `cci-strategy.ts` | CCI ±100 교차 |
| 추세 추종 | `trend-following.ts` | EMA 크로스 + ADX 필터 |
| 고승률 | `high-winrate.ts` | 투표/RSI+BB 바운스/3중 확인 (SignalGeneratorV2에서 사용) |
| SMMA+Stochastic | `smma-stochastic.ts` | SMMA + Stochastic 결합 |

### 리더보드 시스템

- Side Panel의 `Leaderboard.tsx`에서 실행
- `CandleRepository.getAll()` → `runLeaderboard(candles, progressCallback)` 호출
- 전 전략을 동일 데이터에 대해 백테스트 → compositeScore로 순위 결정
- 결과를 `LeaderboardRepository.saveAll()`로 IndexedDB에 영구 저장

### 로깅 시스템 (`src/lib/logger/`)

모듈별 컬러 로깅:
- 사전 정의된 모듈 로거: WS(cyan), Monitor(magenta), Miner(yellow), Collector(green), Executor(red), Signal(blue) 등
- 로그 레벨: debug, info, warn, error, none
- 모듈 필터링: `enabledModules`, `disabledModules`
- 편의 메서드: `success()`, `fail()`, `start()`, `stop()`, `data()`, `signal()`, `trade()`
- 개발자 도구: `window.pqLog.enableDebug()`, `.quiet()`, `.focus('WS', 'Signal')`, `.mute('Parser')`
- localStorage 기반 설정 영속화

## 코드 스니펫

```typescript
// 백테스트 실행 흐름 (개념적)
for (const candle of candles) {
  const signal = strategy.evaluate(candleBuffer)
  if (signal) {
    const trade = simulateTrade(signal, candle, config.expiry, config.payout)
    trades.push(trade)
  }
}
const stats = calculateStatistics(trades)

// 로거 사용 예시
import { loggers } from '../lib/logger'
const log = loggers.miner
log.start('Starting mining...')     // [PO] [Miner] 🚀 Starting mining...
log.success('Saved 100 candles')    // [PO] [Miner] ✅ Saved 100 candles
log.fail('Network error')           // [PO] [Miner] ❌ Network error
```
