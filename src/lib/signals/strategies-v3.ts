// ============================================================
// Strategy V3: SMMA + Stochastic + Market Regime Filter
// ============================================================
// Trending: Entry on SMMA pullback + Stochastic cross
// Ranging: Entry on SMMA mean reversion + Stochastic extreme cross
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../backtest/types';
import { RSI, SMMA, Stochastic } from '../indicators';

export class StrategyV3 implements Strategy {
  id = 'strategy-v3';
  name = 'V3: Adaptive SMMA + Stochastic';
  description = 'Trend-following and Mean-reversion adaptive strategy';

  params = {
    smmaFast: { default: 5, min: 3, max: 10, step: 1 },
    smmaMid: { default: 12, min: 10, max: 20, step: 2 },
    smmaSlow: { default: 25, min: 20, max: 50, step: 5 },
    stochK: { default: 5, min: 5, max: 14, step: 3 },
    stochD: { default: 3, min: 2, max: 5, step: 1 },
    rsiPeriod: { default: 14, min: 7, max: 21, step: 7 },
    atrPeriod: { default: 14, min: 10, max: 20, step: 5 },
    lookbackExtremes: { default: 20, min: 10, max: 30, step: 10 },
    volatilityMultiplier: { default: 0.00015, min: 0.0001, max: 0.0003, step: 0.00005 },
  };

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    if (candles.length < 50) return null;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    // --- INDICATORS ---
    const sFast = SMMA.latest(closes, params.smmaFast);
    const sMid = SMMA.latest(closes, params.smmaMid);
    const sSlow = SMMA.latest(closes, params.smmaSlow);
    const stoch = Stochastic.latest(highs, lows, closes, params.stochK, params.stochD);
    const rsi = RSI.latest(closes, params.rsiPeriod);

    // ATR for Volatility Filter
    const tr = highs.map((h, i) =>
      Math.max(
        h - lows[i],
        Math.abs(h - (closes[i - 1] || h)),
        Math.abs(lows[i] - (closes[i - 1] || lows[i])),
      ),
    );
    const atr = tr.slice(-params.atrPeriod).reduce((a, b) => a + b, 0) / params.atrPeriod;

    // Price Extremes (Support/Resistance Proxy)
    const recentHigh = Math.max(...highs.slice(-params.lookbackExtremes));
    const recentLow = Math.min(...lows.slice(-params.lookbackExtremes));

    if (!sFast || !sMid || !sSlow || !stoch || !rsi) return null;

    // --- MARKET REGIME ---
    const isTrendingUp = sFast > sMid && sMid > sSlow;
    const isTrendingDown = sFast < sMid && sMid < sSlow;

    // Volatility check: Avoid dead markets
    const currentPrice = closes[closes.length - 1];
    const minVolatility = currentPrice * params.volatilityMultiplier;
    if (atr < minVolatility) return null;

    let direction: Direction | null = null;
    let confidence = 0;
    let reason = '';

    // --- "SECRET 52.1%" LOGIC: High Probability Filters ---

    if (isTrendingUp) {
      // PULLBACK IN UPTREND
      // 1. Price is between Fast and Mid SMMA (Sweet spot)
      // 2. Stochastic k-line just crossed above d-line in oversold area (< 35)
      // 3. RSI is still showing momentum (> 48)
      if (
        currentPrice <= sFast &&
        currentPrice >= sMid &&
        stoch.k < 35 &&
        stoch.k > stoch.d &&
        rsi > 48
      ) {
        direction = 'CALL';
        confidence = 0.9;
        reason = 'Trend Pullback (Up)';
      }
    } else if (isTrendingDown) {
      // PULLBACK IN DOWNTREND
      // 1. Price is between Fast and Mid SMMA
      // 2. Stochastic k-line just crossed below d-line in overbought area (> 65)
      // 3. RSI is still showing weakness (< 52)
      if (
        currentPrice >= sFast &&
        currentPrice <= sMid &&
        stoch.k > 65 &&
        stoch.k < stoch.d &&
        rsi < 52
      ) {
        direction = 'PUT';
        confidence = 0.9;
        reason = 'Trend Pullback (Down)';
      }
    } else {
      // MEAN REVERSION IN RANGE
      // Only enter at very extreme edges of the recent range
      if (currentPrice <= recentLow * 1.0001 && stoch.k < 15 && stoch.k > stoch.d && rsi < 25) {
        direction = 'CALL';
        confidence = 0.8;
        reason = 'Range Bottom Extreme';
      } else if (
        currentPrice >= recentHigh * 0.9999 &&
        stoch.k > 85 &&
        stoch.k < stoch.d &&
        rsi > 75
      ) {
        direction = 'PUT';
        confidence = 0.8;
        reason = 'Range Top Extreme';
      }
    }

    return {
      direction,
      confidence,
      reason,
      indicators: {
        rsi,
        stochK: stoch.k,
        stochD: stoch.d,
        sFast,
        sMid,
        sSlow,
      },
    };
  }
}
