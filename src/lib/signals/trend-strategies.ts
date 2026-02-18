// ============================================================
// Trend Strategy Selection for SignalGeneratorV2
// ============================================================
// ADX >= 25 (trending market) 에서 사용할 전략 모음.
// 2개 전략을 우선순위 순으로 시도하고, 첫 번째 유효 신호를 반환.
// ============================================================

import { Candle, MarketRegime } from './types';
import { StrategyResult, HighWinRateConfig } from '../backtest/strategies/high-winrate';
import { emaTrendRsiPullbackStrategy } from '../backtest/strategies/high-winrate';
import { RSI, SMMA, Stochastic } from '../indicators';

// ============================================================
// Regime info type (matches detectRegime output)
// ============================================================

export interface RegimeInput {
  regime: MarketRegime;
  adx: number;
  direction: number; // +1 up, -1 down, 0 neutral
}

// ============================================================
// Strategy 1: V3 SMMA + Stochastic Trend Pullback
// ============================================================
// Adapted from StrategyV3 (strategies-v3.ts) trending branch.
// Detects pullback into fast/mid SMMA zone + stochastic confirmation.
// ============================================================

export interface V3TrendConfig {
  smmaFast: number;
  smmaMid: number;
  smmaSlow: number;
  stochK: number;
  stochD: number;
  rsiPeriod: number;
}

const DEFAULT_V3_TREND_CONFIG: V3TrendConfig = {
  smmaFast: 5,
  smmaMid: 12,
  smmaSlow: 25,
  stochK: 5,
  stochD: 3,
  rsiPeriod: 14,
};

export function v3TrendPullbackStrategy(
  candles: Candle[],
  regimeInfo: RegimeInput,
  config: Partial<V3TrendConfig> = {},
): StrategyResult {
  const cfg = { ...DEFAULT_V3_TREND_CONFIG, ...config };
  const noSignal: StrategyResult = {
    signal: null,
    confidence: 0,
    reason: 'No V3 trend pullback signal',
    indicators: {},
  };

  if (candles.length < 50) {
    return { ...noSignal, reason: 'Insufficient data for V3 trend' };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const sFast = SMMA.latest(closes, cfg.smmaFast);
  const sMid = SMMA.latest(closes, cfg.smmaMid);
  const sSlow = SMMA.latest(closes, cfg.smmaSlow);
  const stoch = Stochastic.latest(highs, lows, closes, cfg.stochK, cfg.stochD);
  const rsi = RSI.latest(closes, cfg.rsiPeriod);

  if (sFast == null || sMid == null || sSlow == null || stoch == null || rsi == null) {
    return { ...noSignal, reason: 'Not enough indicator data' };
  }

  const currentPrice = closes[closes.length - 1];
  const isTrendingUp = sFast > sMid && sMid > sSlow;
  const isTrendingDown = sFast < sMid && sMid < sSlow;

  const indicators: Record<string, number> = {
    sFast,
    sMid,
    sSlow,
    stochK: stoch.k,
    stochD: stoch.d,
    rsi,
    price: currentPrice,
  };

  if (isTrendingUp && regimeInfo.direction >= 0) {
    // Pullback in uptrend: price between fast and mid SMMA,
    // stochastic oversold with K > D crossover, RSI shows momentum
    if (
      currentPrice <= sFast &&
      currentPrice >= sMid &&
      stoch.k < 35 &&
      stoch.k > stoch.d &&
      rsi > 48
    ) {
      return {
        signal: 'CALL',
        confidence: 0.75,
        reason: `V3 uptrend pullback: stoch=${stoch.k.toFixed(1)}, RSI=${rsi.toFixed(1)}`,
        indicators,
      };
    }
  }

  if (isTrendingDown && regimeInfo.direction <= 0) {
    // Pullback in downtrend: price between fast and mid SMMA,
    // stochastic overbought with K < D crossover, RSI shows weakness
    if (
      currentPrice >= sFast &&
      currentPrice <= sMid &&
      stoch.k > 65 &&
      stoch.k < stoch.d &&
      rsi < 52
    ) {
      return {
        signal: 'PUT',
        confidence: 0.75,
        reason: `V3 downtrend pullback: stoch=${stoch.k.toFixed(1)}, RSI=${rsi.toFixed(1)}`,
        indicators,
      };
    }
  }

  return { ...noSignal, indicators };
}

// ============================================================
// Trend Strategy Router
// ============================================================
// Priority order:
// 1. EMA Trend + RSI Pullback (proven backtest performance)
// 2. V3 SMMA + Stochastic Trend Pullback (multi-indicator)
// Returns first valid signal, or null if none.
// ============================================================

export function selectTrendStrategy(
  candles: Candle[],
  regimeInfo: RegimeInput,
  highWinRateConfig: Partial<HighWinRateConfig> = {},
): StrategyResult | null {
  // 1st priority: EMA Trend + RSI Pullback
  const emaPullback = emaTrendRsiPullbackStrategy(candles, highWinRateConfig);
  if (emaPullback && emaPullback.signal) {
    return { ...emaPullback, strategyId: 'EMA-PULLBACK' };
  }

  // 2nd priority: V3 SMMA + Stochastic Trend Pullback
  const v3Result = v3TrendPullbackStrategy(candles, regimeInfo);
  if (v3Result && v3Result.signal) {
    return { ...v3Result, strategyId: 'V3-TREND' };
  }

  return null;
}
