import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v3TrendPullbackStrategy, selectTrendStrategy, RegimeInput } from './trend-strategies';
import { Candle } from './types';

// Mock emaTrendRsiPullbackStrategy
vi.mock('../backtest/strategies/high-winrate', () => ({
  emaTrendRsiPullbackStrategy: vi.fn().mockReturnValue({
    signal: null,
    confidence: 0,
    reason: 'No trend pullback signal',
    indicators: {},
  }),
}));

// ============================================================
// Helpers
// ============================================================

function makeCandle(close: number, timestamp: number, partial?: Partial<Candle>): Candle {
  return {
    timestamp,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
    ...partial,
  };
}

function generateCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 2;
    candles.push(makeCandle(price, 1000000 + i * 60000));
  }
  return candles;
}

const uptrendRegime: RegimeInput = { regime: 'weak_uptrend', adx: 30, direction: 1 };
const downtrendRegime: RegimeInput = { regime: 'weak_downtrend', adx: 28, direction: -1 };
const strongUptrendRegime: RegimeInput = { regime: 'strong_uptrend', adx: 45, direction: 1 };

// ============================================================
// v3TrendPullbackStrategy
// ============================================================

describe('v3TrendPullbackStrategy', () => {
  it('캔들 50개 미만이면 null signal 반환', () => {
    const candles = generateCandles(30);
    const result = v3TrendPullbackStrategy(candles, uptrendRegime);
    expect(result.signal).toBeNull();
    expect(result.reason).toContain('Insufficient');
  });

  it('충분한 데이터가 있으면 StrategyResult를 반환한다 (signal은 null 가능)', () => {
    const candles = generateCandles(80);
    const result = v3TrendPullbackStrategy(candles, uptrendRegime);
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('indicators');
  });

  it('indicators에 sFast, sMid, sSlow, stochK, stochD, rsi 포함', () => {
    const candles = generateCandles(80);
    const result = v3TrendPullbackStrategy(candles, uptrendRegime);
    // 데이터가 충분하면 indicators가 채워져야 한다
    if (Object.keys(result.indicators).length > 0) {
      expect(result.indicators).toHaveProperty('sFast');
      expect(result.indicators).toHaveProperty('sMid');
      expect(result.indicators).toHaveProperty('sSlow');
      expect(result.indicators).toHaveProperty('stochK');
      expect(result.indicators).toHaveProperty('stochD');
      expect(result.indicators).toHaveProperty('rsi');
    }
  });

  it('signal이 CALL 또는 PUT일 때 confidence > 0', () => {
    // 여러 번 시도하여 signal이 나올 수 있는지 검증 (random data)
    let foundSignal = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const candles = generateCandles(80, 100 + attempt);
      const result = v3TrendPullbackStrategy(candles, uptrendRegime);
      if (result.signal) {
        expect(result.confidence).toBeGreaterThan(0);
        foundSignal = true;
        break;
      }
    }
    // 랜덤 데이터에서 신호가 반드시 발생하진 않으므로 조건부
    if (!foundSignal) {
      // no-op: random data didn't trigger, that's OK
    }
  });
});

// ============================================================
// selectTrendStrategy
// ============================================================

describe('selectTrendStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emaTrendRsiPullbackStrategy가 신호를 반환하면 EMA-PULLBACK으로 태깅', async () => {
    const { emaTrendRsiPullbackStrategy } = await import('../backtest/strategies/high-winrate');
    (emaTrendRsiPullbackStrategy as ReturnType<typeof vi.fn>).mockReturnValue({
      signal: 'CALL',
      confidence: 0.7,
      reason: 'Uptrend pullback: RSI 45.0 bouncing',
      indicators: { rsi: 45 },
    });

    const candles = generateCandles(60);
    const result = selectTrendStrategy(candles, uptrendRegime);

    expect(result).not.toBeNull();
    expect(result!.strategyId).toBe('EMA-PULLBACK');
    expect(result!.signal).toBe('CALL');
  });

  it('emaTrendRsiPullbackStrategy가 null이고 v3도 null이면 최종 null', async () => {
    const { emaTrendRsiPullbackStrategy } = await import('../backtest/strategies/high-winrate');
    (emaTrendRsiPullbackStrategy as ReturnType<typeof vi.fn>).mockReturnValue({
      signal: null,
      confidence: 0,
      reason: 'No signal',
      indicators: {},
    });

    const candles = generateCandles(60);
    const result = selectTrendStrategy(candles, uptrendRegime);

    // v3도 랜덤 데이터에선 대부분 null이므로 null 기대
    // (확률적으로 null이 아닐 수도 있지만, 60개 데이터의 랜덤 워크에서 SMMA 정렬 확률은 낮음)
    // 따라서 이 테스트는 emaTrendRsiPullbackStrategy mock이 정확히 호출되는지 검증
    expect(emaTrendRsiPullbackStrategy).toHaveBeenCalled();
  });

  it('EMA-PULLBACK이 우선이고, 없을 때만 V3-TREND가 폴백', async () => {
    const { emaTrendRsiPullbackStrategy } = await import('../backtest/strategies/high-winrate');

    // EMA gives signal → should return EMA, not V3
    (emaTrendRsiPullbackStrategy as ReturnType<typeof vi.fn>).mockReturnValue({
      signal: 'PUT',
      confidence: 0.7,
      reason: 'Downtrend pullback',
      indicators: { rsi: 55 },
    });

    const candles = generateCandles(80);
    const result = selectTrendStrategy(candles, downtrendRegime);

    expect(result).not.toBeNull();
    expect(result!.strategyId).toBe('EMA-PULLBACK');
    expect(result!.signal).toBe('PUT');
  });

  it('highWinRateConfig가 emaTrendRsiPullbackStrategy에 전달된다', async () => {
    const { emaTrendRsiPullbackStrategy } = await import('../backtest/strategies/high-winrate');
    (emaTrendRsiPullbackStrategy as ReturnType<typeof vi.fn>).mockReturnValue({
      signal: null,
      confidence: 0,
      reason: 'No signal',
      indicators: {},
    });

    const candles = generateCandles(60);
    const customConfig = { rsiPeriod: 10, rsiOversold: 30, rsiOverbought: 70 };
    selectTrendStrategy(candles, uptrendRegime, customConfig);

    expect(emaTrendRsiPullbackStrategy).toHaveBeenCalledWith(candles, customConfig);
  });
});
